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
const generateQuestions = async ({ jobId, jobName, questionType, userId, interviewStyle, count }) => {
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
    [skills] = await pool.query(
      "SELECT unitName, knowledge FROM ncs_skills ORDER BY RAND() LIMIT 6"
    );
  }

  const skillText = skills.map((s) => `- ${s.unitName}: ${s.knowledge}`).join("\n");
  const guide = TYPE_GUIDE[questionType] || TYPE_GUIDE["직무기술형"];

  // 도전모드면 1개, 아니면 5개
  const numQuestions = (count === 1) ? 1 : 5;

  // 압박 면접이면 프롬프트에 압박 스타일 지시 추가
  const styleInstruction = interviewStyle === "압박"
    ? `\nThis is a PRESSURE interview. Make the questions more challenging, probing, and demanding. Push the candidate to justify their reasoning and defend their choices. Stay professional and polite, but be firm and rigorous.`
    : "";

  const prompt = `You are a Korean job interviewer for the role of "${jobName}".
Generate exactly ${numQuestions} interview questions.
Question type: ${guide}${styleInstruction}
Ground the questions in these NCS competencies:
${skillText}

Rules:
- Write ALL questions in Korean Hangul only. Do NOT use any Chinese characters.
- Return ONLY a JSON array of ${numQuestions} strings, nothing else.`;

  let questions = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
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

  if (!questions) {
    throw new Error("QUESTION_GENERATION_FAILED");
  }

  const [sessionResult] = await pool.query(
    "INSERT INTO interview_sessions (userId, jobId, jobName, questionType) VALUES (?, ?, ?, ?)",
    [userId ?? null, jobId ?? null, jobName, questionType]
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
    throw new Error("FEEDBACK_GENERATION_FAILED");
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

module.exports = { generateQuestions, evaluateAnswer };