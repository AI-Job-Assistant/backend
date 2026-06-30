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
  const [tables] = await conn.query("SHOW TABLES");
  console.log("📋 클라우드 테이블 목록:", tables.map((t) => Object.values(t)[0]));
  await conn.end();
}
main().catch((err) => console.error("❌ 실패:", err.message));