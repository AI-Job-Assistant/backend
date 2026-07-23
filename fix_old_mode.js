require("dotenv").config();
const mysql = require("mysql2/promise");

async function fix(label, cfg) {
  const conn = await mysql.createConnection(cfg);
  const [r] = await conn.query("UPDATE interview_sessions SET mode = '텍스트' WHERE mode = '일반'");
  console.log(`${label}: ${r.affectedRows}건 수정`);
  await conn.end();
}

async function main() {
  await fix("로컬", {
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT,
  });
  await fix("클라우드", {
    host: process.env.CLOUD_DB_HOST, user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD, database: process.env.CLOUD_DB_NAME, port: process.env.CLOUD_DB_PORT,
  });
}
main().catch((e) => console.error("❌", e.message));