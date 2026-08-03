const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const safeParse = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
};

// IT 직군과 무관한 NCS 제외 (농업/축산/수산 등)
const EXCLUDE = "unitName NOT LIKE '%생육%' AND unitName NOT LIKE '%병충해%' AND unitName NOT LIKE '%재배%' AND unitName NOT LIKE '%작물%' AND unitName NOT LIKE '%농업%' AND unitName NOT LIKE '%축산%' AND unitName NOT LIKE '%양식%' AND unitName NOT LIKE '%어업%' AND unitName NOT LIKE '%임업%' AND unitName NOT LIKE '%원예%'";

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
  "네트워크": ["네트워크"],
  "보안": ["보안", "정보보호"],
  "소프트웨어": ["소프트웨어"],
  "백엔드": ["소프트웨어"],
  "시스템": ["시스템"],
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
2. NEVER put standard names or acronyms in the question: ISO/IEC, ITIL, SLM, ISMS-P, BSC, SPI, CRUD, ETL, BPMN. These make it sound like a textbook.
3. NEVER copy phrases from the background knowledge above. Absorb the idea, then ask in your own natural words.
4. NEVER end with stiff written-exam endings like "설명해 주십시오" / "기술해 주십시오" / "제시해 주십시오" / "무엇인지요?" / "무엇입니까?" / "어떠한가?". End conversationally like a real person speaking: "~있나요?", "~궁금합니다", "~말씀해 주세요", "~어떻게 하시겠어요?", "~어떻게 보시나요?".
5. ONE topic per question. Never use "~하고, ~하는지" to stack two topics.
6. Under 60 Korean characters. Complete polite sentences (존댓말), never 반말.
7. Every question must clearly relate to the role "${jobName}". Do NOT ask about unrelated fields (agriculture, farming, etc).

Target style:
- "데이터 품질 때문에 곤란했던 경험이 있나요?"
- "대용량 로그를 수집한다면 어디서부터 시작하시겠어요?"
- "분석 결과를 비전문가에게 설명해야 했던 적이 있는지 궁금합니다."
${styleInstruction}

Output:
- Korean Hangul only. No Chinese characters.
- Return ONLY a JSON array of ${numQuestions} strings, nothing else.`;

  let questions = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) text = match[0];
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some(hasCJK)) {
        questions = parsed;
        break;
      }
      console.log(`질문 생성 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`질문 생성 재시도 ${i + 1}회 (JSON 파싱 실패)`);
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
    if (sessionId && (smileCount != null || eyeContactRatio != null)) {
      await pool.query("UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?", [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]);
    }
    return { answerId: emptyAnswerId, questionType, penalty: 0, ...emptyFeedback };
  }

  const guide = EVAL_GUIDE[questionType] || EVAL_GUIDE["직무기술형"];
  const prompt = `You are a strict Korean interview coach evaluating a candidate's answer.

Question (${questionType}): ${question}
Candidate's answer: ${answer}

Evaluation criteria for this question type:
${guide}

Return ONLY a JSON object in exactly this shape, all text in Korean:
{
  "score": <integer 0-20>,
  "strengths": ["<잘한 점>", "..."],
  "improvements": ["<개선할 점>", "..."],
  "suggestion": "<답변을 어떻게 보완하면 좋을지 2~3문장>",
  "modelAnswer": "<지원자가 실제 면접에서 말하듯 1인칭 존댓말 경험담으로. STAR 흐름을 자연스럽게 녹이되 당위(~해야 합니다) 아닌 경험(~했습니다)으로. 영어 단어 금지. 3~4문장.>"
}

Scoring rules (VERY IMPORTANT - MAX SCORE IS 20 POINTS):
- Meaningless answers (single characters like "ㅇ", "ㅁ", "asdf", "없음", "모름", repeated characters like "ㅇㅇㅇ", or random text) MUST score exactly 0. Do NOT invent strengths — leave strengths as [].
- Generic filler answers with no real content (e.g. "열심히 하겠습니다", "최선을 다하겠습니다", "잘하겠습니다", "노력하겠습니다") MUST score exactly 0. strengths must be [].
- Answers under 20 Korean characters with no real content: maximum 5 points.
- Answers that just repeat the question without substance: maximum 6 points.
- Only give 14+ when the answer has concrete content, specific examples, or clear reasoning.
- Do NOT inflate scores. Be strict and honest.

Other rules:
- Write ALL text in Korean only. Do NOT use Chinese characters.
- strengths and improvements: 2-3 specific items each referring to the actual answer. (Exception: meaningless answers, strengths = [].)
- Return ONLY the JSON. No markdown, no extra text.`;

  let feedback = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      if (typeof parsed.score === "number" && typeof parsed.modelAnswer === "string" && !hasCJK(JSON.stringify(parsed))) {
        feedback = parsed;
        break;
      }
      console.log(`피드백 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`피드백 재시도 ${i + 1}회 (JSON 파싱 실패)`);
    }
  }

  if (!feedback) {
    console.log("⚠️ Groq 3회 실패 → 기본 피드백으로 대체");
    feedback = {
      score: 0, strengths: [],
      improvements: ["AI 분석이 일시적으로 지연되었습니다. 다시 시도해 주세요."],
      suggestion: "일시적인 오류로 상세 피드백을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      modelAnswer: "일시적인 오류로 모범답안을 생성하지 못했습니다.",
    };
  }

  // 추가 시간 감점 (1회당 1점, 최대 2회)
  const penalty = Math.min(extraTimeUsed ?? 0, 2) * 1;
  if (penalty > 0) {
    feedback.score = Math.max(0, feedback.score - penalty);
    feedback.improvements = [...feedback.improvements, `추가 시간을 ${Math.min(extraTimeUsed, 2)}회 사용하여 ${penalty}점 감점되었습니다.`];
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

  return { answerId, questionType, penalty, ...feedback };
};

// 면접 완료 처리
const completeSession = async ({ sessionId, userId }) => {
  const [result] = await pool.query(
    "UPDATE interview_sessions SET completed = TRUE WHERE id = ? AND userId = ?",
    [sessionId, userId]
  );
  if (result.affectedRows === 0) throw new Error("SESSION_NOT_FOUND");
  return { sessionId, completed: true };
};

// 세션 결과 조회
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

  const results = rows.map((r) => ({
    questionId: r.questionId,
    orderNo: r.orderNo,
    question: r.question,
    answer: r.answer,
    score: r.score,
    strengths: safeParse(r.strengths),
    improvements: safeParse(r.improvements),
    suggestion: r.suggestion,
    modelAnswer: r.modelAnswer,
  }));

  return { session: sessions[0], results };
};

module.exports = { generateQuestions, evaluateAnswer, completeSession, getSessionResult };