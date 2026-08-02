const pool = require('../../config/db');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const hasCJK = (s) => /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/.test(s);

// 통계 — 완료(제출)된 세션만, 도전모드 제외
const getStats = async (userId) => {
  const [sessionRows] = await pool.query(
    "SELECT COUNT(*) AS totalSessions FROM interview_sessions WHERE userId = ? AND mode != '도전' AND completed = TRUE",
    [userId]
  );
  const [scoreRows] = await pool.query(`
    SELECT AVG(f.score) AS avgScore
    FROM feedbacks f
    JOIN answers a ON a.id = f.answerId
    JOIN questions q ON q.id = a.questionId
    JOIN interview_sessions s ON s.id = q.sessionId
    WHERE s.userId = ? AND s.mode != '도전' AND s.completed = TRUE
  `, [userId]);
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
    WHERE s.userId = ? AND s.mode != '도전' AND s.completed = TRUE
  `, [userId]);

  const thisMonth = monthRows[0].thisMonth;
  const lastMonth = monthRows[0].lastMonth;
  const monthlyChange = thisMonth != null && lastMonth != null ? thisMonth - lastMonth : 0;

  return {
    totalSessions: sessionRows[0].totalSessions,
    avgScore: Math.round(scoreRows[0].avgScore || 0),
    monthlyChange,
  };
};

// 최근 이력 — 미완료 뱃지용 isIncomplete 포함
const getHistory = async (userId) => {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.jobName, s.questionType, s.mode, s.completed, s.createdAt,
      ROUND(AVG(f.score)) AS avgScore,
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
    isIncomplete: !r.completed,   // 제출 안 하고 나간 세션 = 미완료
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
    return { topStrengths: [], topWeaknesses: [], summary: "아직 분석할 면접 기록이 없습니다." };
  }

  const allStrengths = [];
  const allWeaknesses = [];
  for (const r of rows) {
    try { allStrengths.push(...JSON.parse(r.strengths || "[]")); } catch {}
    try { allWeaknesses.push(...JSON.parse(r.improvements || "[]")); } catch {}
  }

  const prompt = `You are a Korean career coach. Based on the candidate's interview feedback history below, summarize their patterns.

Strengths collected:
${allStrengths.join("\n")}

Weaknesses collected:
${allWeaknesses.join("\n")}

Return ONLY a JSON object, all text in Korean:
{
  "topStrengths": ["<대표 강점 2~3개>"],
  "topWeaknesses": ["<대표 약점 2~3개>"],
  "summary": "<전체 경향을 2~3문장으로 요약>"
}
Rules: Korean only, no Chinese characters. Return ONLY the JSON.`;

  for (let i = 0; i < 3; i++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      });
      
      const rawText = completion.choices[0].message.content;
      
      // 💡 안전한 JSON 객체 extraction 로직 추가
      let text = rawText;
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        text = match[0];
      } else {
        text = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      }

      const parsed = JSON.parse(text);
      if (parsed.topStrengths && parsed.topWeaknesses && !hasCJK(JSON.stringify(parsed))) {
        return parsed;
      }
      console.log(`분석 재시도 ${i + 1}회 (형식 또는 한자 문제)`);
    } catch (err) {
      console.log(`분석 재시도 ${i + 1}회 (JSON 파싱 실패)`);
      console.error("에러 내용:", err.message);
    }
  }
  
  // Groq 실패 시 (토큰 한도 등) — "기록 없음"이 아니라 일시 오류로 안내
  return {
    topStrengths: [],
    topWeaknesses: [],
    summary: "AI 분석을 일시적으로 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  };
};

module.exports = { getStats, getHistory, getHeatmap, getAnalysis };