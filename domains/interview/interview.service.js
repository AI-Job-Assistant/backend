const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const sanitizeForPrompt = (raw) => {
  return String(raw)
    .replace(/\*\*/g, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/["`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq 70B 우선 호출 및 자동 백업(Fallback) 로직
const callGroqWithFallback = async (messages, temperature = 0.4) => {
  const models = ["llama-3.3-70b-versatile", "llama3-70b-8192", "llama-3.1-8b-instant"];
  let lastError = null;

  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      });
      return completion.choices[0]?.message?.content?.trim();
    } catch (err) {
      lastError = err;
      console.log(`[Groq] ${model} 실패 (${err.message}), 다음 모델 시도...`);
    }
  }
  throw lastError || new Error("ALL_GROQ_MODELS_FAILED");
};

const JUNK_PATTERNS = [
  "녹음 중", "녹음중", "녹음 중입니다",
  "테스트", "test", "테스트입니다",
  "아무말", "몰라요", "모르겠어요", "모르겠습니다",
  "없음", "없어요", "패스", "스킵", "skip",
];

const isJunkAnswer = (raw) => {
  const s = raw.trim().toLowerCase().replace(/[.。,!?~\s]/g, "");
  if (s.length < 4) return true;
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

const safeParse = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
};

const EXCLUDE = "unitName NOT LIKE '%생육%' AND unitName NOT LIKE '%병충해%' AND unitName NOT LIKE '%재배%' AND unitName NOT LIKE '%작물%' AND unitName NOT LIKE '%농업%' AND unitName NOT LIKE '%축산%' AND unitName NOT LIKE '%양식%' AND unitName NOT LIKE '%어업%' AND unitName NOT LIKE '%임업%' AND unitName NOT LIKE '%원예%'";

const TYPE_GUIDE = {
  "경험행동형": "지원자의 과거 경험과 행동을 묻는 질문 (예: ~한 경험을 말해보세요)",
  "직무기술형": "직무 지식과 기술 역량을 확인하는 질문",
  "상황판단형": "구체적인 문제 상황이나 딜레마를 시나리오로 먼저 제시한 뒤, '이런 상황이라면 어떻게 판단하고 대응하겠는가'를 묻는 질문.",
};

const JOB_KEYWORDS = {
  "데이터분석": ["데이터", "빅데이터"],
  "데이터 시스템": ["데이터", "빅데이터"],
  "데이터 엔지니어": ["데이터", "빅데이터"],
  "데이터": ["데이터", "빅데이터"],
  "머신러닝": ["인공지능", "머신러닝"],
  "AI 엔지니어": ["인공지능"],
  "AI 서비스": ["인공지능"],
  "AI": ["인공지능"],
  "인공지능": ["인공지능"],
  "게임": ["게임"],
  "보안": ["보안", "정보보호"],
  "네트워크": ["네트워크"],
  "컴퓨터시스템설계": ["소프트웨어", "아키텍처"],
  "시스템 소프트웨어": ["소프트웨어"],
  "정보 시스템 운영": ["소프트웨어", "운영", "네트워크"],
  "소프트웨어": ["소프트웨어"],
  "시스템": ["소프트웨어", "시스템"],
};

const EVAL_GUIDE = {
  "경험행동형": `Evaluate with the STAR method. Check if the answer clearly shows the Situation, the Task/goal, the specific Actions the candidate took, and the measurable Result. Penalize vague answers with no concrete action or outcome.`,
  "직무기술형": `Evaluate technical accuracy and depth. Check if the answer is factually correct, shows real understanding (not just buzzwords), and gives concrete examples or trade-offs. Penalize shallow or wrong answers.`,
  "상황판단형": `Evaluate judgment and reasoning. Check if the answer analyzes the situation, weighs options, justifies the decision, and considers consequences/stakeholders.`,
};

// 질문 생성
const generateQuestions = async ({ jobId, jobName, questionType, userId, interviewStyle, count, mode, sessionType }) => {
  if (!jobName) {
    const [jobs] = await pool.query("SELECT jobName FROM jobs WHERE id = ?", [jobId]);
    if (jobs.length === 0) throw new Error("JOB_NOT_FOUND");
    jobName = jobs[0].jobName;
  }

  let words = null;
  for (const key in JOB_KEYWORDS) {
    if (jobName.includes(key)) { words = JOB_KEYWORDS[key]; break; }
  }

  let skills = [];
  if (words) {
    const conds = words.map(() => "unitName LIKE ?").join(" OR ");
    const vals = words.map((w) => `%${w}%`);
    [skills] = await pool.query(
      `SELECT unitName, knowledge FROM ncs_skills WHERE (${conds}) AND ${EXCLUDE} ORDER BY RAND() LIMIT 6`,
      vals
    );
  }
  if (skills.length === 0) {
    [skills] = await pool.query(
      `SELECT unitName, knowledge FROM ncs_skills WHERE ${EXCLUDE} ORDER BY RAND() LIMIT 6`
    );
  }

  const skillText = skills.map((s) => `- ${s.unitName}: ${s.knowledge}`).join("\n");
  const guide = TYPE_GUIDE[questionType] || TYPE_GUIDE["직무기술형"];

  const isChallenge = (sessionType === "challenge" || mode === "도전" || count === 1);
  const numQuestions = isChallenge ? 1 : 5;
  const sessionMode =
    isChallenge ? "도전"
    : (mode === "스피킹") ? "스피킹"
    : "텍스트";

  const styleInstruction = interviewStyle === "압박"
    ? `
PRESSURE MODE:
Every question must challenge the candidate.
- Question judgment or assume failure.
Never write a neutral question. Keep 존댓말.`
    : "";

  const prompt = `You are an experienced Korean job interviewer conducting a real interview for the role of "${jobName}".
Generate exactly ${numQuestions} interview questions.
Question type: ${guide}

Background knowledge (use as inspiration only):
${skillText}

CRITICAL RULES:
1. Speak like a real interviewer in Korean.
2. Under 60 Korean characters. Complete polite sentences (존댓말).
3. Do NOT use ISO, ITIL, ISMS-P, CRUD, ETL.
${styleInstruction}

Return ONLY a JSON object in this exact structure:
{
  "questions": ["질문1", "질문2"]
}`;

  let questions = null;
  for (let i = 0; i < 3; i++) {
    try {
      const text = await callGroqWithFallback([{ role: "user", content: prompt }], 0.5);
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : text);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0 && !parsed.questions.some(hasCJK)) {
        questions = parsed.questions;
        break;
      }
    } catch (err) {
      console.log(`질문 생성 재시도 ${i + 1}회 실패`);
    }
  }

  if (!questions) throw new Error("QUESTION_GENERATION_FAILED");

  const [sessionResult] = await pool.query(
    "INSERT INTO interview_sessions (userId, jobId, jobName, questionType, mode) VALUES (?, ?, ?, ?, ?)",
    [userId ?? null, jobId ?? null, jobName, questionType, sessionMode]
  );
  const sessionId = sessionResult.insertId;

  const savedQuestions = [];
  for (let i = 0; i < questions.length; i++) {
    const [q] = await pool.query(
      "INSERT INTO questions (sessionId, orderNo, content) VALUES (?, ?, ?)",
      [sessionId, i + 1, questions[i]]
    );
    savedQuestions.push({ id: q.insertId, orderNo: i + 1, content: questions[i] });
  }

  return { sessionId, jobName, questionType, questions: savedQuestions };
};

// 답변 평가
const evaluateAnswer = async ({ questionId, question, answer, questionType, sessionId, smileCount, eyeContactRatio, extraTimeUsed }) => {
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

  if (isJunkAnswer(answer)) {
    const junkFeedback = {
      score: 0, strengths: [],
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

  const guide = EVAL_GUIDE[questionType] || EVAL_GUIDE["직무기술형"];
  const cleanAnswer = sanitizeForPrompt(answer);
  const prompt = `You are a strict Korean interview coach evaluating a candidate's answer.

Question (${questionType}): ${question}
Candidate's answer: ${cleanAnswer}

Evaluation criteria:
${guide}

Return ONLY a JSON object in Korean:
{
  "score": <integer 0-20>,
  "strengths": ["<잘한 점>", "..."],
  "improvements": ["<개선할 점>", "..."],
  "suggestion": "<답변 보완 2~3문장>",
  "modelAnswer": "<1인칭 경험담 모범답안 3~4문장>"
}`;

  let feedback = null;
  for (let i = 0; i < 4; i++) {
    try {
      const text = await callGroqWithFallback([{ role: "user", content: prompt }], 0.3);
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : text);

      if (typeof parsed.score === "number" && typeof parsed.modelAnswer === "string" && !hasCJK(JSON.stringify(parsed))) {
        feedback = parsed;
        break;
      }
    } catch (err) {
      console.log(`피드백 평가 재시도 ${i + 1}회 실패`);
    }
    await sleep(500);
  }

  if (!feedback) {
    feedback = {
      score: 0, strengths: [],
      improvements: ["AI 분석이 일시적으로 지연되었습니다. 다시 시도해 주세요."],
      suggestion: "일시적인 오류로 상세 피드백을 생성하지 못했습니다.",
      modelAnswer: "일시적인 오류로 모범답안을 생성하지 못했습니다.",
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

const completeSession = async ({ sessionId, userId }) => {
  const [result] = await pool.query(
    "UPDATE interview_sessions SET completed = TRUE WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (result.affectedRows === 0) throw new Error("SESSION_NOT_FOUND");
  return { sessionId, completed: true };
};

const getSessionResult = async ({ sessionId, userId }) => {
  const [sessions] = await pool.query(
    "SELECT id, jobName, questionType, mode, completed, createdAt FROM interview_sessions WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (sessions.length === 0) throw new Error("SESSION_NOT_FOUND");

  const [rows] = await pool.query(`
    SELECT q.id AS questionId, q.orderNo, q.content AS question,
           a.content AS answer,
           f.score, f.strengths, f.improvements, f.suggestion, f.modelAnswer
    FROM questions q
    LEFT JOIN answers a ON a.questionId = q.id
    LEFT JOIN feedbacks f ON f.answerId = a.id
    WHERE q.sessionId = ?
    ORDER BY q.orderNo
  `, [sessionId]);

  const isChallenge = sessions[0].mode === "도전";

  const results = rows.map((r) => ({
    questionId: r.questionId,
    orderNo: r.orderNo,
    question: r.question,
    answer: r.answer,
    score: (isChallenge && r.score != null) ? r.score * 5 : r.score,
    strengths: safeParse(r.strengths),
    improvements: safeParse(r.improvements),
    suggestion: r.suggestion,
    modelAnswer: r.modelAnswer,
  }));

  return { session: sessions[0], results };
};

module.exports = { generateQuestions, evaluateAnswer, completeSession, getSessionResult };