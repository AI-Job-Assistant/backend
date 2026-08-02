const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const TYPE_GUIDE = {
  "경험행동형": "지원자의 과거 경험과 행동을 묻는 질문 (예: ~한 경험을 말해보세요)",
  "직무기술형": "직무 지식과 기술 역량을 확인하는 질문",
  "상황판단형": "구체적인 문제 상황이나 딜레마를 시나리오로 먼저 제시한 뒤, '이런 상황이라면 어떻게 판단하고 대응하겠는가'를 묻는 질문.",
};

const JOB_KEYWORDS = {
  "데이터": ["데이터"],
  "인공지능": ["인공지능"],
  "AI": ["인공지능"],
  "머신러닝": ["인공지능"],
  "딥러닝": ["인공지능"],
  "게임": ["게임"],
  "시스템": ["시스템"],
  "소프트웨어": ["소프트웨어"],
  "백엔드": ["소프트웨어"],
  "보안": ["보안", "정보보호"],
  "네트워크": ["네트워크"],
};

const EVAL_GUIDE = {
  "경험행동형": `Evaluate with the STAR method. Check if the answer clearly shows the Situation, the Task/goal, the specific Actions the candidate took, and the measurable Result. Penalize vague answers with no concrete action or outcome.`,
  "직무기술형": `Evaluate technical accuracy and depth. Check if the answer is factually correct, shows real understanding (not just buzzwords), and gives concrete examples or trade-offs. Penalize shallow or wrong answers.`,
  "상황판단형": `Evaluate judgment and reasoning. Check if the answer analyzes the situation, weighs options, justifies the decision, and considers consequences/stakeholders.`,
};

// AI Hub 실제 IT 채용면접 질문 (few-shot 예시)
const FEWSHOT = {
  "직무기술형": [
    "테스트 코드를 짜야 하는 이유에 관해서 말씀해 주세요.",
    "본인께서는 개발 능력 향상을 위해 어떤 것을 하고 계신가요?",
    "고객이 개발 기간을 촉박하게 요구하는 경우라면 어떻게 대응하시겠습니까?",
  ],
  "경험행동형": [
    "지금까지 살아오면서 가장 힘들었던 경험은 무엇이고, 그것을 어떻게 극복하셨는지 궁금합니다.",
    "어떤 목표를 세워서 달성했던 경험이 있으신가요?",
    "새로운 환경에서 전혀 몰랐던 일을 맡아본 경험이 있으시다면 소개해 주세요.",
  ],
  "상황판단형": [
    "업무 중 스케줄에 없던 일이 생기는 상황이 발생한다면 어떻게 대처하시겠어요?",
    "고객의 요구사항이 팀 역량을 넘어선다면 어떻게 판단하시겠습니까?",
    "촉박한 일정과 품질 중 하나를 택해야 한다면 어느 쪽을 우선하시겠어요?",
  ],
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
      `SELECT unitName, knowledge FROM ncs_skills WHERE ${conds} ORDER BY RAND() LIMIT 6`,
      vals
    );
  }
  if (skills.length === 0) {
    [skills] = await pool.query("SELECT unitName, knowledge FROM ncs_skills ORDER BY RAND() LIMIT 6");
  }

  const skillText = skills.map((s) => `- ${s.unitName}: ${s.knowledge}`).join("\n");
  const guide = TYPE_GUIDE[questionType] || TYPE_GUIDE["직무기술형"];
  const examples = FEWSHOT[questionType] || FEWSHOT["직무기술형"];
  const fewshotText = examples.map((q) => `- ${q}`).join("\n");

  const isChallenge = (sessionType === "challenge" || mode === "도전" || count === 1);
  const numQuestions = isChallenge ? 1 : 5;
  const sessionMode =
    isChallenge ? "도전"
    : (mode === "스피킹") ? "스피킹"
    : "텍스트";

  const styleInstruction = interviewStyle === "압박"
    ? `

PRESSURE MODE (this overrides the neutral tone above):
Every question must challenge the candidate, not just ask for information.
Each question MUST do one of these:
- Question their judgment: "그 판단이 옳았다고 보시나요?"
- Assume failure: "그 방법이 실패했다면 어떻게 하시겠어요?"
- Demand justification: "왜 하필 그 방식을 선택하셨나요?"
- Present opposition: "팀에서 반대했다면 어떻게 설득하시겠어요?"
- Point out a weakness: "그 접근의 한계는 무엇이라고 보시나요?"
Never write a neutral "~는 무엇인가요?" question in this mode.
Keep 존댓말. Never 반말 or fragments.`
    : "";

  const prompt = `You are an experienced Korean job interviewer conducting a real interview for the role of "${jobName}".
Generate exactly ${numQuestions} interview questions.
Question type: ${guide}

Background knowledge (use as inspiration only, NEVER quote directly):
${skillText}

CRITICAL WRITING RULES — follow these strictly, they override everything above:
1. Write like a real interviewer speaking face-to-face. NOT like a written exam or certification test.
2. NEVER put standard names or acronyms in the question: ISO/IEC, ITIL, SLM, ISMS-P, BSC, SPI, CRUD, ETL. These make it sound like a textbook.
3. NEVER copy phrases from the background knowledge above. Absorb the idea, then ask in your own natural words.
4. NEVER end with "설명해 주십시오" / "기술해 주십시오" / "제시해 주십시오". End conversationally: "~있나요?", "~궁금합니다", "~말씀해 주세요", "~어떻게 하시겠어요?".
5. ONE topic per question. Never use "~하고, ~하는지" to stack two topics.
6. Under 60 Korean characters. Complete polite sentences (존댓말), never 반말.

Real interview questions of this type (match this natural spoken tone):
${fewshotText}
${styleInstruction}

Output:
- Korean Hangul only. No Chinese characters.
- Return ONLY a JSON array of ${numQuestions} strings, nothing else.`;

  let questions = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });
      
      const rawText = completion.choices[0].message.content;
      console.log(`🔥 Groq 원본 응답 (질문 생성 ${i + 1}회차):\n`, rawText);
      
      // JSON 배열 부분만 확실하게 추출
      let text = rawText;
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        text = match[0]; // [ 부터 ] 까지만 추출
      } else {
        text = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      }

      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some(hasCJK)) {
        questions = parsed;
        break;
      }
      console.log(`질문 생성 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`질문 생성 재시도 ${i + 1}회 (JSON 파싱 실패)`);
      console.error("에러 내용:", err.message);
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
  // 빈 답변은 Groq 호출 없이 0점 처리
  if (!answer || answer.trim().length === 0) {
    const emptyFeedback = {
      score: 0,
      strengths: [],
      improvements: ["답변을 입력하지 않았습니다.", "시간 내에 답변을 작성하는 연습이 필요합니다."],
      suggestion: "이 질문에 답변하지 않았습니다. 짧더라도 자신의 생각을 정리해 답변해 보세요.",
      modelAnswer: "답변이 없어 모범답안을 제공하지 않습니다.",
    };

    const [r] = await pool.query(
      "INSERT INTO answers (questionId, content) VALUES (?, ?)",
      [questionId ?? null, ""]
    );
    const emptyAnswerId = r.insertId;

    await pool.query(
      "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion) VALUES (?, ?, ?, ?, ?)",
      [emptyAnswerId, 0, JSON.stringify([]), JSON.stringify(emptyFeedback.improvements), emptyFeedback.suggestion]
    );

    if (sessionId && (smileCount != null || eyeContactRatio != null)) {
      await pool.query(
        "UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?",
        [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]
      );
    }

    return { answerId: emptyAnswerId, questionType, ...emptyFeedback };
  }

  const guide = EVAL_GUIDE[questionType] || EVAL_GUIDE["직무기술형"];
  const prompt = `You are a strict Korean interview coach evaluating a candidate's answer.

Question (${questionType}): ${question}
Candidate's answer: ${answer}

Evaluation criteria for this question type:
${guide}

Return ONLY a JSON object in exactly this shape, all text in Korean:
{
  "score": <integer 0-100>,
  "strengths": ["<잘한 점>", "..."],
  "improvements": ["<개선할 점>", "..."],
  "suggestion": "<답변을 어떻게 보완하면 좋을지 2~3문장>",
  "modelAnswer": "<이 질문에 대한 모범답안 예시. 지원자 답변이 부실해도 질문에 맞는 이상적인 답을 3~4문장으로. 경험행동형이면 STAR 구조로>"
}

Scoring rules (VERY IMPORTANT):
- Meaningless answers (single characters like "ㅇ", "ㅁ", "asdf", "없음", "모름", repeated characters like "ㅇㅇㅇ", or random text) MUST score 0-5. Do NOT invent strengths for these — leave strengths as an empty array [].
- Answers under 20 Korean characters with no real content: maximum 25 points.
- Answers that just repeat the question without adding substance: maximum 30 points.
- Only give 70+ when the answer has concrete content, specific examples, or clear reasoning that matches the criteria.
- Do NOT inflate scores. Be strict and honest. A weak answer should clearly score low.

Other rules:
- Write ALL text in Korean only. Do NOT use Chinese characters.
- strengths and improvements: 2-3 specific items each that refer to the actual answer. (Exception: for meaningless answers, strengths = [].)
- Return ONLY the JSON. No markdown, no extra text.`;

  let feedback = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      });
      
      const rawText = completion.choices[0].message.content;
      console.log(`🔥 Groq 원본 응답 (답변 평가 ${i + 1}회차):\n`, rawText);

      // JSON 객체 부분만 확실하게 추출
      let text = rawText;
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        text = match[0]; // { 부터 } 까지만 추출
      } else {
        text = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      }

      const parsed = JSON.parse(text);
      if (typeof parsed.score === "number" && typeof parsed.modelAnswer === "string" && !hasCJK(JSON.stringify(parsed))) {
        feedback = parsed;
        break;
      }
      console.log(`피드백 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`피드백 재시도 ${i + 1}회 (JSON 파싱 실패)`);
      console.error("에러 내용:", err.message);
    }
  }

  if (!feedback) {
    console.log("⚠️ Groq 3회 실패 → 기본 피드백으로 대체");
    feedback = {
      score: 0,
      strengths: [],
      improvements: ["AI 분석이 일시적으로 지연되었습니다. 다시 시도해 주세요."],
      suggestion: "일시적인 오류로 상세 피드백을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      modelAnswer: "일시적인 오류로 모범답안을 생성하지 못했습니다.",
    };
  }

  // 추가 시간 사용 시 감점 (한 번당 3점, 최대 2번)
  const penalty = Math.min(extraTimeUsed ?? 0, 2) * 3;
  if (penalty > 0) {
    feedback.score = Math.max(0, feedback.score - penalty);
    feedback.improvements = [
      ...feedback.improvements,
      `추가 시간을 ${Math.min(extraTimeUsed, 2)}회 사용하여 ${penalty}점 감점되었습니다.`,
    ];
  }
  
  const [answerResult] = await pool.query(
    "INSERT INTO answers (questionId, content) VALUES (?, ?)",
    [questionId ?? null, answer]
  );
  const answerId = answerResult.insertId;

  await pool.query(
    "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion) VALUES (?, ?, ?, ?, ?)",
    [answerId, feedback.score, JSON.stringify(feedback.strengths), JSON.stringify(feedback.improvements), feedback.suggestion]
  );

  if (sessionId && (smileCount != null || eyeContactRatio != null)) {
    await pool.query(
      "UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?",
      [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]
    );
  }

  return { answerId, questionType, ...feedback };
};

// 면접 완료 처리 (제출하기 버튼)
const completeSession = async ({ sessionId, userId }) => {
  const [result] = await pool.query(
    "UPDATE interview_sessions SET completed = TRUE WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (result.affectedRows === 0) {
    throw new Error("SESSION_NOT_FOUND");
  }
  return { sessionId, completed: true };
};

module.exports = { generateQuestions, evaluateAnswer, completeSession };