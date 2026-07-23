require("dotenv").config();
const mysql = require("mysql2/promise");

const DEPTS = [
  "AI융합학부(주전공)",
  "AI융합학부(복수전공)",
  "컴퓨터공학과(주전공)",
  "컴퓨터공학과(복수전공)",
];

async function replace(label, cfg) {
  const conn = await mysql.createConnection(cfg);
  try {
    // 현재 테이블 구조 확인 (문제 생기면 참고용)
    const [cols] = await conn.query("DESCRIBE departments");
    console.log(`\n[${label}] 컬럼:`, cols.map((c) => c.Field).join(", "));

    await conn.query("TRUNCATE TABLE departments");
    for (const name of DEPTS) {
      await conn.query("INSERT INTO departments (deptName) VALUES (?)", [name]);
    }

    const [rows] = await conn.query("SELECT id, deptName FROM departments ORDER BY id");
    console.log(`✅ ${label}: ${rows.length}개 교체 완료`);
    console.table(rows);
  } catch (err) {
    console.error(`❌ ${label}: ${err.message}`);
  }
  await conn.end();
}

async function main() {
  await replace("로컬", {
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT,
  });
  await replace("클라우드", {
    host: process.env.CLOUD_DB_HOST, user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD, database: process.env.CLOUD_DB_NAME, port: process.env.CLOUD_DB_PORT,
  });
}
main();