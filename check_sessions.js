require("dotenv").config();
const mysql = require("mysql2/promise");
async function main() {
  const conn = await mysql.createConnection({
    host: process.env.CLOUD_DB_HOST, user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD, database: process.env.CLOUD_DB_NAME,
    port: process.env.CLOUD_DB_PORT,
  });
  const [rows] = await conn.query(
    "SELECT id, userId, jobName, questionType, createdAt FROM interview_sessions ORDER BY id DESC LIMIT 5"
  );
  console.log("최근 세션:", JSON.stringify(rows, null, 2));
  await conn.end();
}
main().catch((e) => console.error("❌", e.message));