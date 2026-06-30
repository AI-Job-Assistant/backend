require("dotenv").config();
const Groq = require("groq-sdk");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = 5000;

app.use(cors());

app.use(express.json());
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// DB 연결 풀 (.env에서 정보 읽어옴)
// 배포 환경(Render)이면 클라우드 DB, 아니면 로컬 DB 사용
const isProd = process.env.NODE_ENV === "production";

const pool = mysql.createPool({
  host: isProd ? process.env.CLOUD_DB_HOST : process.env.DB_HOST,
  port: isProd ? process.env.CLOUD_DB_PORT : process.env.DB_PORT,
  user: isProd ? process.env.CLOUD_DB_USER : process.env.DB_USER,
  password: isProd ? process.env.CLOUD_DB_PASSWORD : process.env.DB_PASSWORD,
  database: isProd ? process.env.CLOUD_DB_NAME : process.env.DB_NAME,
});

app.get("/", (req, res) => {
  res.send("JobCoach 백엔드 작동 중!");
});

// 직무 목록 (진짜 DB에서)
app.get("/api/jobs", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, jobCode, jobName, categoryName FROM jobs ORDER BY jobName"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "직무 목록을 불러오지 못했습니다." });
  }
});

// 학과 목록 (중복 학과명 제거해서)
app.get("/api/departments", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT MIN(id) AS id, deptName FROM departments GROUP BY deptName ORDER BY deptName"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "학과 목록을 불러오지 못했습니다." });
  }
});

// 특정 직무의 NCS 능력단위 목록
app.get("/api/jobs/:id/ncs", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT nd.id, nd.ncsCode, nd.dutyName, nd.definition,
              nd.majorCat, nd.midCat, nd.minorCat
       FROM ncs_duties nd
       JOIN jobs j ON j.jobCode = nd.jobCode
       WHERE j.id = ?`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "NCS 능력단위를 불러오지 못했습니다." });
  }
});
const TYPE_GUIDE = {
  "경험행동형": "지원자의 과거 경험과 행동을 묻는 질문 (예: ~한 경험을 말해보세요)",
  "직무기술형": "직무 지식과 기술 역량을 확인하는 질문",
  "상황판단형": "구체적인 문제 상황이나 딜레마를 시나리오로 먼저 제시한 뒤, '이런 상황이라면 어떻게 판단하고 대응하겠는가'를 묻는 질문. 출시 일정 압박, 우선순위 충돌, 장애 대응 같은 상황을 가정하고 의사결정을 물을 것.",
};

// 직무명에 이 단어가 들어있으면 → 이 키워드들로 관련 NCS를 찾는다
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

app.post("/api/interview/questions", async (req, res) => {
  try {
    const { jobId, questionType } = req.body;
    let jobName = req.body.jobName;   // 직무명을 직접 받을 수 있음

// jobName이 안 왔으면 jobId로 DB 조회 (기존 방식)
    if (!jobName) {
      const [jobs] = await pool.query("SELECT jobName FROM jobs WHERE id = ?", [jobId]);
      if (jobs.length === 0) return res.status(404).json({ error: "직무를 찾을 수 없습니다." });
      jobName = jobs[0].jobName;
    }

// 2. 질문 재료: 직무명 키워드로 관련 NCS를 뽑는다
//    (ncs_duties의 jobCode 매핑이 부정확해서 키워드 필터를 메인으로 사용)
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
   
    // 3. 프롬프트
    const guide = TYPE_GUIDE[questionType] || TYPE_GUIDE["직무기술형"];
    const prompt = `You are a Korean job interviewer for the role of "${jobName}".
Generate exactly 5 interview questions.
Question type: ${guide}
Ground the questions in these NCS competencies:
${skillText}

Rules:
- Write ALL questions in Korean Hangul only. Do NOT use any Chinese characters (漢字).
- Return ONLY a JSON array of 5 strings, nothing else.`;
    
// 4. Groq 호출 + 파싱 (한자 섞이면 재생성)
const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

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
  console.log(`한자 감지 — 재생성 ${i + 1}회`);
}

// === DB 저장: 세션 1개 + 질문 5개 ===
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

res.json({ sessionId, jobName, questionType, questions: savedQuestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "질문 생성에 실패했습니다." });
  }
});

app.post("/api/interview/feedback", async (req, res) => {
  try {
    const { questionId, question, answer, questionType, sessionId, smileCount, eyeContactRatio } = req.body;
    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({ error: "답변이 비어 있습니다." });
    }

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

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

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
  console.log(`한자 감지 — 피드백 재생성 ${i + 1}회`);
}

// === DB 저장: 답변 + 피드백 ===
const [answerResult] = await pool.query(
  "INSERT INTO answers (questionId, content) VALUES (?, ?)",
  [questionId ?? null, answer]
);
const answerId = answerResult.insertId;

await pool.query(
  "INSERT INTO feedbacks (answerId, score, strengths, improvements, suggestion) VALUES (?, ?, ?, ?, ?)",
  [
    answerId,
    feedback.score,
    JSON.stringify(feedback.strengths),
    JSON.stringify(feedback.improvements),
    feedback.suggestion,
  ]
);

// 카메라 지표가 넘어오면 세션에 저장 (텍스트 면접이면 안 넘어와서 건너뜀)
    if (sessionId && (smileCount != null || eyeContactRatio != null)) {
      await pool.query(
        "UPDATE interview_sessions SET smileCount = ?, eyeContactRatio = ? WHERE id = ?",
        [smileCount ?? 0, eyeContactRatio ?? 0, sessionId]
      );
    }

    res.json({ answerId, questionType, ...feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "피드백 생성에 실패했습니다." });
  }
});

app.get("/api/mypage/stats", async (req, res) => {
  try {
    const [sessionRows] = await pool.query(
      "SELECT COUNT(*) AS totalSessions FROM interview_sessions"
    );
    const [scoreRows] = await pool.query(
      "SELECT AVG(score) AS avgScore FROM feedbacks"
    );

    res.json({
      totalSessions: sessionRows[0].totalSessions,
      avgScore: Math.round(scoreRows[0].avgScore || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "통계 조회에 실패했습니다." });
  }
});

app.get("/api/mypage/history", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        s.id,
        s.jobName,
        s.questionType,
        s.createdAt,
        ROUND(AVG(f.score)) AS avgScore,
        TIMESTAMPDIFF(MINUTE, s.createdAt, MAX(a.createdAt)) AS durationMin,
        s.smileCount,
        s.eyeContactRatio
      FROM interview_sessions s
      LEFT JOIN questions q ON q.sessionId = s.id
      LEFT JOIN answers a ON a.questionId = q.id
      LEFT JOIN feedbacks f ON f.answerId = a.id
      GROUP BY s.id, s.jobName, s.questionType, s.createdAt, s.smileCount, s.eyeContactRatio
      ORDER BY s.createdAt DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "이력 조회에 실패했습니다." });
  }
});

app.get("/api/mypage/heatmap", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(s.createdAt, '%Y-%m-%d') AS date,
        COUNT(DISTINCT s.id) AS sessionCount,
        ROUND(AVG(f.score)) AS avgScore
      FROM interview_sessions s
      LEFT JOIN questions q ON q.sessionId = s.id
      LEFT JOIN answers a ON a.questionId = q.id
      LEFT JOIN feedbacks f ON f.answerId = a.id
      GROUP BY DATE_FORMAT(s.createdAt, '%Y-%m-%d')
      ORDER BY date
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "히트맵 조회에 실패했습니다." });
  }
});

// 마이페이지 - 강점·약점 AI 분석
app.get("/api/mypage/analysis", async (req, res) => {
  try {
    // 1. 누적된 피드백 모으기 (최근 50개)
    const [rows] = await pool.query(
      "SELECT strengths, improvements FROM feedbacks ORDER BY createdAt DESC LIMIT 50"
    );

    // 데이터가 없으면 분석 불가
    if (rows.length === 0) {
      return res.json({
        hasData: false,
        message: "아직 분석할 면접 기록이 없어요. 모의면접을 먼저 진행해보세요.",
        topStrengths: [],
        topWeaknesses: [],
        summary: "",
      });
    }

    // 2. 강점/개선점을 하나로 합치기 (JSON 컬럼이라 파싱)
    const allStrengths = [];
    const allImprovements = [];
    for (const r of rows) {
      const s = typeof r.strengths === "string" ? JSON.parse(r.strengths) : r.strengths;
      const i = typeof r.improvements === "string" ? JSON.parse(r.improvements) : r.improvements;
      if (Array.isArray(s)) allStrengths.push(...s);
      if (Array.isArray(i)) allImprovements.push(...i);
    }

    // 3. 프롬프트
    const prompt = `다음은 한 지원자가 여러 번의 모의면접에서 받은 피드백 모음입니다.

[강점으로 지적된 것들]
${allStrengths.map((x) => "- " + x).join("\n")}

[개선점으로 지적된 것들]
${allImprovements.map((x) => "- " + x).join("\n")}

위 피드백 전체에서 반복적으로 나타나는 패턴을 분석해주세요.
- 대표 강점 2~3개 (반복되는 잘하는 점)
- 대표 약점 2~3개 (반복되는 개선 필요점)
- 종합 코멘트 1~2문장 (격려 + 핵심 조언)

반드시 한국어로, 아래 JSON 형식으로만 답하세요. 다른 말은 절대 쓰지 마세요.
{
  "topStrengths": ["...", "..."],
  "topWeaknesses": ["...", "..."],
  "summary": "..."
}`;

    // 4. Groq 호출 (한자 섞이면 재생성, 최대 3회)
    const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);
    let analysis;
    for (let i = 0; i < 3; i++) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
      analysis = JSON.parse(text);
      if (!hasCJK(JSON.stringify(analysis))) break;
      console.log(`한자 감지 — 분석 재생성 ${i + 1}회`);
    }

    res.json({
      hasData: true,
      basedOn: rows.length, // 몇 개 면접 기반인지
      topStrengths: analysis.topStrengths,
      topWeaknesses: analysis.topWeaknesses,
      summary: analysis.summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "강점·약점 분석에 실패했습니다." });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});