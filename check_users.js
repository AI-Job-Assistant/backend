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
  const [rows] = await conn.query("SELECT id, studentId, name, email FROM users");
  console.log("현재 가입된 유저:", JSON.stringify(rows, null, 2));
  await conn.end();
}
main().catch((err) => console.error("❌ 실패:", err.message));