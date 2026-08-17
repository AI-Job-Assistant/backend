const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const safeParse = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
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

const getStats = async (userId) => {
  const [sessionRows] = await pool.query(
    "SELECT COUNT(*) AS totalSessions FROM interview_sessions WHERE userId = ? AND mode != '도전' AND completed = TRUE",
    [userId]
  );

  const [scoreRows] = await pool.query(`
    SELECT AVG(sessionTotal) AS avgScore FROM (
      SELECT s.id, SUM(f.score) AS sessionTotal
      FROM feedbacks f
      JOIN answers a ON a.id = f.answerId
      JOIN questions q ON q.id = a.questionId
      JOIN interview_sessions s ON s.id = q.sessionId
      WHERE s.userId = ? AND s.mode != '도전' AND s.completed = TRUE
      GROUP BY s.id
    ) AS sessionScores
  `, [userId]);

  const [monthRows] = await pool.query(`
    SELECT
      ROUND(AVG(CASE WHEN createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN sessionTotal END)) AS thisMonth,
      ROUND(AVG(CASE WHEN createdAt >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01')
                     AND createdAt <  DATE_FORMAT(NOW(), '%Y-%m-01') THEN sessionTotal END)) AS lastMonth
    FROM (
      SELECT s.id, s.createdAt, SUM(f.score) AS sessionTotal
      FROM feedbacks f
      JOIN answers a ON a.id = f.answerId
      JOIN questions q ON q.id = a.questionId
      JOIN interview_sessions s ON s.id = q.sessionId
      WHERE s.userId = ? AND s.mode != '도전' AND s.completed = TRUE
      GROUP BY s.id, s.createdAt
    ) AS sessionScores
  `, [userId]);

  const thisMonth = monthRows[0].thisMonth;
  const lastMonth = monthRows[0].lastMonth;
  const monthlyChange = thisMonth != null && lastMonth != null ? thisMonth - lastMonth : 0;

  const [userRows] = await pool.query("SELECT goal FROM users WHERE id = ?", [userId]);
  const goal = userRows[0]?.goal ?? null;

  return {
    totalSessions: sessionRows[0].totalSessions,
    avgScore: Math.round(scoreRows[0].avgScore || 0),
    monthlyChange,
    goal,
  };
};

const getHistory = async (userId) => {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.jobName, s.questionType, s.mode, s.completed, s.createdAt,
      COALESCE(SUM(f.score), 0) AS avgScore,
      TIMESTAMPDIFF(MINUTE, s.createdAt, MAX(a.createdAt)) AS durationMin,
      s.smileCount, s.eyeContactRatio
    FROM interview_sessions s
    LEFT JOIN questions q ON q.sessionId = s.id
    LEFT JOIN answers a ON a.questionId = q.id
    LEFT JOIN feedbacks f ON f.answerId = a.id
    WHERE s.userId = ?
    GROUP BY s.id, s.jobName, s.questionType, s.mode, s.completed, s.createdAt, s.smileCount, s.eyeContactRatio
    ORDER BY s.createdAt DESC
    LIMIT 10
  `, [userId]);

  return rows.map((r) => ({
    ...r,
    avgScore: r.mode === '도전' ? Number(r.avgScore) * 5 : r.avgScore,
    isIncomplete: !r.completed,
  }));
};

const getHeatmap = async (userId) => {
  const [rows] = await pool.query(`
    SELECT
      DATE_FORMAT(s.createdAt, '%Y-%m-%d') AS date,
      COUNT(DISTINCT s.id) AS sessionCount,
      ROUND(AVG(f.score)) AS avgScore
    FROM interview_sessions s
    LEFT JOIN questions q ON q.sessionId = s.id
    LEFT JOIN answers a ON a.questionId = q.id
    LEFT JOIN feedbacks f ON f.answerId = a.id
    WHERE s.userId = ?
    GROUP BY DATE_FORMAT(s.createdAt, '%Y-%m-%d')
    ORDER BY date
  `, [userId]);
  return rows;
};

const getAnalysis = async (userId) => {
  const [rows] = await pool.query(`
    SELECT f.strengths, f.improvements
    FROM feedbacks f
    JOIN answers a ON a.id = f.answerId
    JOIN questions q ON q.id = a.questionId
    JOIN interview_sessions s ON s.id = q.sessionId
    WHERE s.userId = ?
    ORDER BY f.createdAt DESC
    LIMIT 50
  `, [userId]);

  if (rows.length === 0) {
    return {
      hasData: false,
      message: "아직 분석할 면접 기록이 없어요. 모의면접을 먼저 진행해보세요.",
      topStrengths: [], topWeaknesses: [], summary: "",
    };
  }

  const allStrengths = [];
  const allImprovements = [];
  for (const r of rows) {
    allStrengths.push(...safeParse(r.strengths));
    allImprovements.push(...safeParse(r.improvements));
  }

  const prompt = `지원자의 면접 피드백 분석 후 아래 JSON으로 답하세요.
[강점]
${allStrengths.map((x) => "- " + x).join("\n")}
[개선점]
${allImprovements.map((x) => "- " + x).join("\n")}

JSON 구조:
{
  "topStrengths": ["강점1", "강점2"],
  "topWeaknesses": ["약점1", "약점2"],
  "summary": "종합 요약 1~2문장"
}`;

  let analysis = null;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a JSON generator. Output valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const parsed = safeParseJson(completion.choices[0]?.message?.content);
    if (parsed && Array.isArray(parsed.topStrengths) && Array.isArray(parsed.topWeaknesses) && !hasCJK(JSON.stringify(parsed))) {
      analysis = parsed;
    }
  } catch (err) {
    console.log(`마이페이지 분석 실패: ${err.message}`);
  }

  if (!analysis) {
    return {
      hasData: true,
      basedOn: rows.length,
      topStrengths: ["논리적인 답변 구성을 보여줍니다."],
      topWeaknesses: ["구체적인 직무 경험과 숫자를 활용한 성과 제시가 필요합니다."],
      summary: "꾸준히 모의면접을 진행하며 자신만의 경험을 구체적인 사례로 정립해보세요.",
    };
  }

  return {
    hasData: true,
    basedOn: rows.length,
    topStrengths: analysis.topStrengths,
    topWeaknesses: analysis.topWeaknesses,
    summary: analysis.summary,
  };
};

const updateGoal = async (userId, goal) => {
  await pool.query("UPDATE users SET goal = ? WHERE id = ?", [goal, userId]);
  return { goal };
};

module.exports = { getStats, getHistory, getHeatmap, getAnalysis, updateGoal };