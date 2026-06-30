require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.CLOUD_DB_HOST,
    user: process.env.CLOUD_DB_USER,
    password: process.env.CLOUD_DB_PASSWORD,
    database: process.env.CLOUD_DB_NAME,
    port: process.env.CLOUD_DB_PORT,
    multipleStatements: true,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      userId INT NULL,
      jobId INT NULL,
      jobName VARCHAR(100) NOT NULL,
      questionType VARCHAR(20),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      smileCount INT DEFAULT 0,
      eyeContactRatio DECIMAL(4,3) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      sessionId INT,
      orderNo INT,
      content TEXT,
      FOREIGN KEY (sessionId) REFERENCES interview_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      questionId INT,
      content TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (questionId) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      answerId INT,
      score INT,
      strengths JSON,
      improvements JSON,
      suggestion TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (answerId) REFERENCES answers(id) ON DELETE CASCADE
    );
  `);

  console.log("✅ 면접 결과 테이블 4개 생성 완료!");
  const [tables] = await conn.query("SHOW TABLES");
  console.log("📋 전체 테이블:", tables.map((t) => Object.values(t)[0]));
  await conn.end();
}
main().catch((err) => console.error("❌ 실패:", err.message));