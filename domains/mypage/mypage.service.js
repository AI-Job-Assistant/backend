const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

// 통계
const getStats = async () => {
  const [sessionRows] = await pool.query(
    "SELECT COUNT(*) AS totalSessions FROM interview_sessions"
  );
  const [scoreRows] = await pool.query(
    "SELECT AVG(score) AS avgScore FROM feedbacks"
  );
  const [monthRows] = await pool.query(`
    SELECT
      ROUND(AVG(CASE WHEN s.createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01')
                     THEN f.score END)) AS thisMonth,
      ROUND(AVG(CASE WHEN s.createdAt >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01')
                      AND s.createdAt <  DATE_FORMAT(NOW(), '%Y-%m-01')
                     THEN f.score END)) AS lastMonth
    FROM feedbacks f
    JOIN answers a ON a.id = f.answerId
    JOIN questions q ON q.id = a.questionId
    JOIN interview_sessions s ON s.id = q.sessionId
  `);
  const thisMonth = monthRows[0].thisMonth;
  const lastMonth = monthRows[0].lastMonth;
  const monthlyChange = thisMonth != null && lastMonth != null ? thisMonth - lastMonth : 0;

  return {
    totalSessions: sessionRows[0].totalSessions,
    avgScore: Math.round(scoreRows[0].avgScore || 0),
    monthlyChange,
  };
};

// 최근 이력
const getHistory = async () => {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.jobName, s.questionType, s.createdAt,
      ROUND(AVG(f.score)) AS avgScore,
      TIMESTAMPDIFF(MINUTE, s.createdAt, MAX(a.createdAt)) AS durationMin,
      s.smileCount, s.eyeContactRatio
    FROM interview_sessions s
    LEFT JOIN questions q ON q.sessionId = s.id
    LEFT JOIN answers a ON a.questionId = q.id
    LEFT JOIN feedbacks f ON f.answerId = a.id
    GROUP BY s.id, s.jobName, s.questionType, s.createdAt, s.smileCount, s.eyeContactRatio
    ORDER BY s.createdAt DESC
    LIMIT 10
  `);
  return rows;
};

// 히트맵
const getHeatmap = async () => {
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
  return rows;
};

// 강점·약점 분석
const getAnalysis = async () => {
  const [rows] = await pool.query(
    "SELECT strengths, improvements FROM feedbacks ORDER BY createdAt DESC LIMIT 50"
  );

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
    const s = typeof r.strengths === "string" ? JSON.parse(r.strengths) : r.strengths;
    const i = typeof r.improvements === "string" ? JSON.parse(r.improvements) : r.improvements;
    if (Array.isArray(s)) allStrengths.push(...s);
    if (Array.isArray(i)) allImprovements.push(...i);
  }

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
  }

  return {
    hasData: true,
    basedOn: rows.length,
    topStrengths: analysis.topStrengths,
    topWeaknesses: analysis.topWeaknesses,
    summary: analysis.summary,
  };
};

module.exports = { getStats, getHistory, getHeatmap, getAnalysis };