const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const formatDate = (date) => {
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}.${month}.${day}`;
};

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
const generateQuestions = async ({ userId, jobId, jobName, questionType }) => {
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

      // 유효성 확인: 배열이고, 비어있지 않고, 한자 없어야 통과
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some(hasCJK)) {
        questions = parsed;
        break;
      }
      console.log(`질문 생성 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`질문 생성 재시도 ${i + 1}회 (JSON 파싱 실패)`);
    }
  }

  // 3번 다 실패하면 명확한 에러
  if (!questions) {
    throw new Error("QUESTION_GENERATION_FAILED");
  }

  // DB 저장
  const [sessionResult] = await pool.query(
     `
    INSERT INTO interview_sessions
      (userId, jobId, jobName, questionType)
    VALUES (?, ?, ?, ?)
  `,
  [userId, jobId ?? null, jobName, questionType]
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
const evaluateAnswer = async ({ userId, questionId, question, answer, questionType, sessionId, smileCount, eyeContactRatio }) => {
    const [questionRows] = await pool.query(
    `
      SELECT
        q.id,
        q.sessionId
      FROM questions q
      JOIN interview_sessions s
        ON s.id = q.sessionId
      WHERE q.id = ?
        AND s.userId = ?
    `,
    [questionId, userId]
  );

  if (questionRows.length === 0) {
    throw new Error("QUESTION_ACCESS_DENIED");
  }

  const ownedSessionId = questionRows[0].sessionId;

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
  "suggestion": "<답변을 어떻게 보완하면 좋을지 2~3문장>",
  "modelAnswer": "<이 질문에 대한 모범답안 예시. 해당 직무·질문유형에 맞게 3~4문장으로. 경험행동형이면 STAR 구조로 작성>"
}

Rules:
- Write ALL text in Korean only.
- Score honestly based on the criteria. Do NOT inflate. A vague or wrong answer should score low.
- strengths and improvements: 2-3 specific items each, referring to the actual answer.
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

      // 유효성 확인: score가 숫자이고, 한자 없어야 통과
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
  if (smileCount != null || eyeContactRatio != null) {
  await pool.query(
    `
      UPDATE interview_sessions
      SET
        smileCount = ?,
        eyeContactRatio = ?
      WHERE id = ?
        AND userId = ?
    `,
    [
      smileCount ?? 0,
      eyeContactRatio ?? 0,
      ownedSessionId,
      userId,
    ]
  );
}

  return { answerId, questionType, ...feedback };
};

const getInterviewById = async (interviewId, userId) => {
  const [sessionRows] = await pool.query(
    `
      SELECT
        id,
        userId,
        jobId,
        jobName,
        questionType,
        createdAt,
        smileCount,
        eyeContactRatio
      FROM interview_sessions
      WHERE id = ?
    `,
    [interviewId]
  );

  if (sessionRows.length === 0) {
    throw new Error("INTERVIEW_NOT_FOUND");
  }

  const session = sessionRows[0];

  if (Number(session.userId) !== Number(userId)) {
    throw new Error("INTERVIEW_ACCESS_DENIED");
  }

  const [rows] = await pool.query(
    `
      SELECT
        q.id AS questionId,
        q.orderNo,
        q.content AS question,
        a.id AS answerId,
        a.content AS answer,
        a.createdAt AS answeredAt,
        f.score,
        f.strengths,
        f.improvements,
        f.suggestion
      FROM questions q
      LEFT JOIN answers a
        ON a.questionId = q.id
      LEFT JOIN feedbacks f
        ON f.answerId = a.id
      WHERE q.sessionId = ?
      ORDER BY q.orderNo ASC
    `,
    [interviewId]
  );

  const items = rows.map((row) => {
    let strengths = row.strengths;
    let improvements = row.improvements;

    if (typeof strengths === "string") {
      try {
        strengths = JSON.parse(strengths);
      } catch {
        strengths = [];
      }
    }

    if (typeof improvements === "string") {
      try {
        improvements = JSON.parse(improvements);
      } catch {
        improvements = [];
      }
    }

    return {
      questionId: row.questionId,
      orderNo: row.orderNo,
      question: row.question,
      answerId: row.answerId,
      answer: row.answer,
      answeredAt: row.answeredAt,
      score: row.score == null ? null : Number(row.score),
      strengths: Array.isArray(strengths) ? strengths : [],
      improvements: Array.isArray(improvements) ? improvements : [],
      suggestion: row.suggestion,
    };
  });

  const scoredItems = items.filter(
    (item) => item.score != null
  );

  const averageScore =
    scoredItems.length === 0
      ? null
      : Math.round(
          scoredItems.reduce(
            (sum, item) => sum + item.score,
            0
          ) / scoredItems.length
        );

  return {
    id: session.id,
    jobId: session.jobId,
    jobName: session.jobName,
    questionType: session.questionType,
    createdAt: session.createdAt,
    formattedDate: formatDate(session.createdAt),
    smileCount: Number(session.smileCount || 0),
    eyeContactRatio: Number(session.eyeContactRatio || 0),
    averageScore,
    questions: items,
  };
};

module.exports = { generateQuestions, evaluateAnswer, getInterviewById };