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

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT,
      studentId VARCHAR(20) NOT NULL,
      name VARCHAR(50) NOT NULL,
      email VARCHAR(100) NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      departmentId INT DEFAULT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY studentId (studentId),
      UNIQUE KEY email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  console.log("✅ 클라우드에 users 테이블 생성 완료!");
  const [tables] = await conn.query("SHOW TABLES");
  console.log("📋 전체 테이블:", tables.map((t) => Object.values(t)[0]));
  await conn.end();
}
main().catch((err) => console.error("❌ 실패:", err.message));