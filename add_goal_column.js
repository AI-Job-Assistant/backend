require("dotenv").config();
const mysql = require("mysql2/promise");
async function add(label, cfg) {
  const conn = await mysql.createConnection(cfg);
  try {
    await conn.query("ALTER TABLE users ADD COLUMN goal VARCHAR(100) NULL");
    console.log(`✅ ${label}: goal 추가`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") console.log(`ℹ️ ${label}: 이미 있음`);
    else console.error(`❌ ${label}: ${e.message}`);
  }
  await conn.end();
}
async function main() {
  await add("로컬", { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT });
  await add("클라우드", { host: process.env.CLOUD_DB_HOST, user: process.env.CLOUD_DB_USER, password: process.env.CLOUD_DB_PASSWORD, database: process.env.CLOUD_DB_NAME, port: process.env.CLOUD_DB_PORT });
}
main().catch(e => console.error("❌", e.message));