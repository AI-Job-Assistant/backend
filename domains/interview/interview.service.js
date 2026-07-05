const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const TYPE_GUIDE = {
  "경험행동형": "지원자의 과거 경험과 행동을 묻는 질문 (예: ~한 경험을 말해보세요)",
  "직무기술형": "직무 지식과 기술 역량을 확인하는 질문",
  "상황판단형": "구체적인 문제 상황이나 딜레마를 시나리오로 먼저 제시한 뒤, '이런 상황이라면 어떻게 판단하고 대응하겠는가'를 묻는 질문. 출시 일정 압박, 우선순위 충돌, 장애 대응 같은 상황을 가정하고 의사결정을 물을 것.",
};

const JOB_KEYWORDS = {
  "데이터":     ["데이터"],
  "인공지능":   ["인공지능"],
  "AI":         ["인공지능"],
  "머신러닝":   ["인공지능"],
  "딥러닝":     ["인공지능"],
  "게임":       ["게임"],
  "시스템":     ["시스템"],
  "소프트웨어": ["소프트웨어"],
  "백엔드":     ["소프트웨어"],
  "보안":       ["보안", "정보보호"],
  "네트워크":   ["네트워크"],
};

const EVAL_GUIDE = {
  "경험행동형": `Evaluate with the STAR method. Check if the answer clearly shows the Situation, the Task/goal, the specific Actions the candidate took, and the measurable Result. Penalize vague answers with no concrete action or outcome.`,
  "직무기술형": `Evaluate technical accuracy and depth. Check if the answer is factually correct, shows real understanding (not just buzzwords), and gives concrete examples or trade-offs. Penalize shallow or wrong answers.`,
  "상황판단형": `Evaluate judgment and reasoning. Check if the answer analyzes the situation, weighs options, justifies the decision, and considers consequences/stakeholders.`,
};

// 질문 생성
const generateQuestions = async ({ jobId, jobName, questionType }) => {
  // jobName이 안 왔으면 jobId로 조회
  if (!jobName) {
    const [jobs] = await pool.query("SELECT jobName FROM jobs WHERE id = ?", [jobId]);
    if (jobs.length === 0) throw new Error("JOB_NOT_FOUND");
    jobName = jobs[0].jobName;
  }

  // 키워드로 관련 NCS 뽑기
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
    [skills] = await pool.query(
      "SELECT unitName, knowledge FROM ncs_skills ORDER BY RAND() LIMIT 6"
    );
  }

  const skillText = skills.map((s) => `- ${s.unitName}: ${s.knowledge}`).join("\n");
  const guide = TYPE_GUIDE[questionType] || TYPE_GUIDE["직무기술형"];
  const prompt = `You are a Korean job interviewer for the role of "${jobName}".
Generate exactly 5 interview questions.
Question type: ${guide}
Ground the questions in these NCS competencies:
${skillText}

Rules:
- Write ALL questions in Korean Hangul only. Do NOT use any Chinese characters (漢字).
- Return ONLY a JSON array of 5 strings, nothing else.`;

  let questions = [];
  for (let i = 0; i < 3; i++) {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });
    let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    questions = JSON.parse(text);
    if (!questions.some(hasCJK)) break;
  }

  // DB 저장
  const [sessionResult] = await pool.query(
    "INSERT INTO interview_sessions (userId, jobId, jobName, questionType) VALUES (?, ?, ?, ?)",
    [null, jobId ?? null, jobName, questionType]
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
const evaluateAnswer = async ({ questionId, question, answer, questionType, sessionId, smileCount, eyeContactRatio }) => {
  const guide = EVAL_GUIDE[questionType] || EVAL_GUIDE["직무기술형"];
  const prompt = `You are a Korean interview coach evaluating a candidate's answer.

Question (${questionType}): ${question}
Candidate's answer: ${answer}

Evaluation criteria for this question type:
${guide}

Return ONLY a JSON object in exactly this shape, all text in Korean:
{
  "score": <integer 0-100>,
  "strengths": ["<잘한 점>", "..."],
  "improvements": ["<개선할 점>", "..."],
  "suggestion": "<답변을 어떻게 보완하면 좋을지 2~3문장>"
}

Rules:
- Write ALL text in Korean only.
- Score honestly based on the criteria. Do NOT inflate. A vague or wrong answer should score low.
- strengths and improvements: 2-3 specific items each, referring to the actual answer.
- Return ONLY the JSON. No markdown, no extra text.`;

  let feedback;
  for (let i = 0; i < 3; i++) {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });
    let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    feedback = JSON.parse(text);
    if (!hasCJK(JSON.stringify(feedback))) break;
  }

  // DB 저장
  const [answerResult] = await pool.query(
    "INSERT INTO answers (questionId, content) VALUES (?, ?)",
    [questionId ?? null, answer]
  );
  const answerId = answerResult.insertId;

  await pool.query(
    "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion) VALUES (?, ?, ?, ?, ?)",
    [answerId, feedback.score, JSON.stringify(feedback.strengths), JSON.stringify(feedback.improvements), feedback.suggestion]
  );

  // 카메라 지표 저장 (넘어온 경우만)
  if (sessionId && (smileCount != null || eyeContactRatio != null)) {
    await pool.query(
      "UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?",
      [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]
    );
  }

  return { answerId, questionType, ...feedback };
};

module.exports = { generateQuestions, evaluateAnswer };