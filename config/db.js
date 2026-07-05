const mysql = require('mysql2/promise');
require('dotenv').config();

// 배포 환경(Render)이면 클라우드 DB, 아니면 로컬 DB 사용
const isProd = process.env.NODE_ENV === "production";

const pool = mysql.createPool({
  host: isProd ? process.env.CLOUD_DB_HOST : process.env.DB_HOST,
  port: isProd ? process.env.CLOUD_DB_PORT : process.env.DB_PORT,
  user: isProd ? process.env.CLOUD_DB_USER : process.env.DB_USER,
  password: isProd ? process.env.CLOUD_DB_PASSWORD : process.env.DB_PASSWORD,
  database: isProd ? process.env.CLOUD_DB_NAME : process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;