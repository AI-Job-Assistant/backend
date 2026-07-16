require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      studentId VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(50) NOT NULL,
      email VARCHAR(100),
      passwordHash VARCHAR(255) NOT NULL,
      departmentId INT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("✅ users 테이블 생성 완료!");
  const [rows] = await conn.query("DESCRIBE users");
  console.log("컬럼:", rows.map((r) => r.Field));
  await conn.end();
}
main().catch((err) => console.error("❌ 실패:", err.message));