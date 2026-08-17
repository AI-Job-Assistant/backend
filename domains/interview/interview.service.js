const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const sanitizeForPrompt = (raw) => {
  return String(raw)
    .replace(/\*\*/g, "")
    .replace(/[""]/g, "'")
    .replace(/['']/g, "'")
    .replace(/[`"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const safeParseJson = (text) => {
  if (!text) return null;
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) clean = match[0];
  try {
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
};

const JUNK_PATTERNS = [
  "녹음 중", "녹음중", "녹음 중입니다",
  "테스트", "test", "테스트입니다",
  "아무말", "몰라요", "모르겠어요", "모르겠습니다",
  "없음", "없어요", "패스", "스킵", "skip", "깜짝이야", "아니", "어라"
];

// 무성의/쓰레기 답변 검증 로직 강화
const isJunkAnswer = (raw) => {
  const s = raw.trim().toLowerCase().replace(/[.。,!?~\s]/g, "");
  
  // 1. 10글자 미만 단답/추임새는 무조건 쓰레기 답변으로 처리
  if (s.length < 10) return true;

  const CONTAINS_JUNK = [
    "녹음", "다시누르", "테스트중", "마이크테스트",
    "음성인식", "인식된답변", "직접수정", "직접입력",
    "카메라사용안", "카메라사용", "누적돼요", "여기에",
  ];

  if (CONTAINS_JUNK.some((p) => s.includes(p.replace(/\s/g, "")))) return true;
  return JUNK_PATTERNS.some((p) => {
    const pp = p.toLowerCase().replace(/\s/g, "");
    return s === pp || (s.length <= pp.length + 2 && s.includes(pp));
  });
};

// 답변 평가
const evaluateAnswer = async ({ questionId, question, answer, questionType, sessionId, smileCount, eyeContactRatio, extraTimeUsed }) => {
  // 1. 공백 답변 -> 0점
  if (!answer || answer.trim().length === 0) {
    const emptyFeedback = {
      score: 0, strengths: [],
      improvements: ["답변을 입력하지 않았습니다.", "시간 내에 답변을 작성하는 연습이 필요합니다."],
      suggestion: "이 질문에 답변하지 않았습니다. 짧더라도 자신의 생각을 정리해 답변해 보세요.",
      modelAnswer: "답변이 없어 모범답안을 제공하지 않습니다.",
    };
    const [r] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, ""]);
    const emptyAnswerId = r.insertId;
    await pool.query(
      "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
      [emptyAnswerId, 0, JSON.stringify([]), JSON.stringify(emptyFeedback.improvements), emptyFeedback.suggestion, emptyFeedback.modelAnswer]
    );
    return { answerId: emptyAnswerId, questionType, penalty: 0, ...emptyFeedback };
  }

  // 2. 쓰레기/무성의 답변 필터링 -> 0점
  if (isJunkAnswer(answer)) {
    const junkFeedback = {
      score: 0,
      strengths: [],
      improvements: ["질문에 대한 실질적인 답변이 아닙니다.", "질문의 요지에 맞춰 구체적으로 답변해 주세요."],
      suggestion: "이 답변은 질문과 관련된 내용을 담고 있지 않습니다. 자신의 경험이나 지식을 바탕으로 구체적으로 답변해 보세요.",
      modelAnswer: "실질적인 답변이 아니어서 모범답안을 제공하지 않습니다.",
    };
    const [r] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, answer]);
    const junkAnswerId = r.insertId;
    await pool.query(
      "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
      [junkAnswerId, 0, JSON.stringify([]), JSON.stringify(junkFeedback.improvements), junkFeedback.suggestion, junkFeedback.modelAnswer]
    );
    return { answerId: junkAnswerId, questionType, penalty: 0, ...junkFeedback };
  }

  const cleanAnswer = sanitizeForPrompt(answer);
  const prompt = `Evaluate this interview answer in Korean.
Question: ${question}
Answer: ${cleanAnswer}

CRITICAL SCORING RULE:
- If the answer is nonsensical, irrelevant, or lacks meaningful content, set "score" strictly to 0.
- Otherwise, give a score from 0 to 20 based on relevancy and quality.

JSON Format:
{
  "score": <integer 0-20>,
  "strengths": ["강점1"],
  "improvements": ["개선점1"],
  "suggestion": "조언 2~3문장",
  "modelAnswer": "모범답안 3~4문장"
}`;

  let feedback = null;
  const evalModels = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];

  for (const model of evalModels) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You are a strict Korean interview coach. Strictly output valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const parsed = safeParseJson(completion.choices[0]?.message?.content);

      if (parsed && typeof parsed.score === "number" && typeof parsed.modelAnswer === "string" && !hasCJK(JSON.stringify(parsed))) {
        feedback = parsed;
        break;
      }
    } catch (err) {
      console.log(`평가 시도 (${model}) 실패: ${err.message}`);
    }
  }

  // 3. AI 평가 파싱 실패 시 예비 점수 0점으로 수정 (기존 10점 -> 0점)
  if (!feedback) {
    feedback = {
      score: 0,
      strengths: [],
      improvements: ["질문의 의도와 맞지 않거나 유효하지 않은 답변입니다."],
      suggestion: "질문의 의도에 맞게 경험과 성과를 구체적으로 설명해보세요.",
      modelAnswer: "해당 질문에 대해 자신의 직무 경험과 성과를 바탕으로 명확히 답변해 보세요.",
    };
  }

  const penalty = Math.min(extraTimeUsed ?? 0, 2) * 1;
  if (penalty > 0) {
    feedback.score = Math.max(0, feedback.score - penalty);
    feedback.improvements = [...feedback.improvements, `추가 시간을 사용해 ${penalty}점 감점되었습니다.`];
  }

  const [answerResult] = await pool.query("INSERT INTO answers (questionId, content) VALUES (?, ?)", [questionId ?? null, answer]);
  const answerId = answerResult.insertId;
  await pool.query(
    "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion, modelAnswer) VALUES (?, ?, ?, ?, ?, ?)",
    [answerId, feedback.score, JSON.stringify(feedback.strengths), JSON.stringify(feedback.improvements), feedback.suggestion, feedback.modelAnswer]
  );

  if (sessionId && (smileCount != null || eyeContactRatio != null)) {
    await pool.query("UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?", [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]);
  }

  let responseScore = feedback.score;
  if (sessionId) {
    const [sess] = await pool.query("SELECT mode FROM interview_sessions WHERE id = ?", [sessionId]);
    if (sess.length > 0 && sess[0].mode === "도전") {
      responseScore = feedback.score * 5;
    }
  }

  return { answerId, questionType, penalty, ...feedback, score: responseScore };
};