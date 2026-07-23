require("dotenv").config();
const mysql = require("mysql2/promise");

const SQL = "ALTER TABLE interview_sessions ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT '일반'";

async function addTo(label, config) {
  const conn = await mysql.createConnection(config);
  try {
    await conn.query(SQL);
    console.log(`✅ ${label}: mode 컬럼 추가 완료`);
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") console.log(`ℹ️ ${label}: 이미 있음 (건너뜀)`);
    else console.error(`❌ ${label}: ${err.message}`);
  }
  await conn.end();
}

async function main() {
  await addTo("로컬", {
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT,
  });
  await addTo("클라우드", {
    host: process.env.CLOUD_DB_HOST, user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD, database: process.env.CLOUD_DB_NAME, port: process.env.CLOUD_DB_PORT,
  });
}
main();