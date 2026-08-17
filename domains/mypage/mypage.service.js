const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

const safeParse = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
};

// 통계 — 완료된 세션만, 도전모드 제외, 100점 총점 기준
const getStats = async (userId) => {
  const [sessionRows] = await pool.query(
    "SELECT COUNT(*) AS totalSessions FROM interview_sessions WHERE userId = ? AND mode != '도전' AND completed = TRUE",
    [userId]
  );

  // 세션별 총점(SUM)을 먼저 내고, 그 총점들의 평균
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

  // 이번 달 / 지난 달 (세션별 총점 기준)
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

// 최근 이력 — 면접별 총점(SUM). 도전 모드는 문제 1개(최대 20점)이므로
// 결과 화면(feedback 응답)과 동일하게 100점 스케일로 x5 환산해서 표시.
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
    // 도전 모드만 x5 (일반/스피킹 면접은 이미 5문제 합산이라 그대로)
    avgScore: r.mode === '도전' ? Number(r.avgScore) * 5 : r.avgScore,
    isIncomplete: !r.completed,
  }));
};

// 잔디(히트맵)
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

// 강점·약점 분석 (Groq)
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

  let analysis = null;
  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });
      let text = completion.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.topStrengths) && !hasCJK(JSON.stringify(parsed))) {
        analysis = parsed;
        break;
      }
      console.log(`분석 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`분석 재시도 ${i + 1}회 (JSON 파싱 실패)`);
    }
  }

  // Groq 실패 시 "기록 없음"이 아니라 일시 오류로 안내
  if (!analysis) {
    return {
      hasData: true,
      basedOn: rows.length,
      topStrengths: [],
      topWeaknesses: [],
      summary: "AI 분석을 일시적으로 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
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

// 목표 저장
const updateGoal = async (userId, goal) => {
  await pool.query("UPDATE users SET goal = ? WHERE id = ?", [goal, userId]);
  return { goal };
};

module.exports = { getStats, getHistory, getHeatmap, getAnalysis, updateGoal };