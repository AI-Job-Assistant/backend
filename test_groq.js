require("dotenv").config();
const mysql = require("mysql2/promise");
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const jobName = "데이터분석가";
  // 직무 관련 NCS 능력단위 몇 개 (질문 재료)
  const [skills] = await conn.query(
    "SELECT unitName, knowledge FROM ncs_skills WHERE unitName LIKE '%데이터%' LIMIT 5"
  );
  const skillText = skills.map((s) => `- ${s.unitName}: ${s.knowledge}`).join("\n");

  const prompt = `You are a Korean job interviewer for the role of "${jobName}".
Generate exactly 5 technical interview questions based on these NCS competencies:
${skillText}

Rules:
- Write ALL questions in Korean only.
- Return ONLY a JSON array of 5 strings, nothing else.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  console.log("=== Groq 응답 ===");
  console.log(completion.choices[0].message.content);

  await conn.end();
}

main().catch((e) => { console.error("에러:", e); process.exit(1); });