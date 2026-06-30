require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.CLOUD_DB_HOST,
    user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD,
    database: process.env.CLOUD_DB_NAME,
    port: process.env.CLOUD_DB_PORT,
    multipleStatements: true,
  });

  let sql = fs.readFileSync("./schema.sql", "utf8");

  // 첫 'CREATE TABLE' 이전(= CREATE DATABASE, USE 등)을 통째로 잘라냄
  const idx = sql.toUpperCase().indexOf("CREATE TABLE");
  sql = sql.slice(idx);

  await conn.query(sql);
  console.log("✅ railway DB에 테이블 생성 완료!");

  const [tables] = await conn.query("SHOW TABLES");
  console.log("📋 생성된 테이블:", tables.map((t) => Object.values(t)[0]));

  await conn.end();
}
main().catch((err) => console.error("❌ 실패:", err.message));