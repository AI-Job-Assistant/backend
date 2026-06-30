require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.CLOUD_DB_HOST,
    user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD,
    database: process.env.CLOUD_DB_NAME,
    port: process.env.CLOUD_DB_PORT,
  });
  const [rows] = await conn.query("SELECT 1 + 1 AS result");
  console.log("✅ 클라우드 DB 연결 성공! 결과:", rows[0].result);
  await conn.end();
}
main().catch((err) => console.error("❌ 연결 실패:", err.message));