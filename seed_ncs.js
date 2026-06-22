require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

function readCsv(filename) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(__dirname, "data", filename))
      .pipe(csv({ mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim() }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log("DB 연결 성공");
  await conn.query("TRUNCATE TABLE ncs_skills");

  const rows = await readCsv("ncs_skills.csv");
  const values = rows.map((r) => [
    r["능력단위코드"], r["능력단위명"], r["정의"],
    r["대분류"], r["중분류"], r["소분류"], r["세분류"],
    r["지식"], r["기술"], r["태도"], r["검색키워드"],
  ]);
  if (values.length) {
    await conn.query(
      "INSERT INTO ncs_skills (ncsCode, unitName, definition, majorCat, midCat, minorCat, subCat, knowledge, skill, attitude, keyword) VALUES ?",
      [values]
    );
  }
  console.log(`ncs_skills: ${values.length}건`);
  await conn.end();
  console.log("완료!");
}

main().catch((e) => { console.error("에러:", e); process.exit(1); });