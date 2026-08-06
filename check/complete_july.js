require("dotenv").config();
const mysql = require("mysql2/promise");
async function main() {
  const conn = await mysql.createConnection({
    host: process.env.CLOUD_DB_HOST, user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD, database: process.env.CLOUD_DB_NAME, port: process.env.CLOUD_DB_PORT,
  });
  const ids = [72, 73, 148]; // userId 7의 7월 세션
  const [result] = await conn.query(
    "UPDATE interview_sessions SET completed = TRUE WHERE id IN (?) AND userId = 7",
    [ids]
  );
  console.log(`✅ ${result.affectedRows}개 세션 완료 처리됨`);
  await conn.end();
}
main().catch(e => console.error("❌", e.message));