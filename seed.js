const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const DB_CONFIG = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "Judy0706!",   // ← 이 줄만 바꾸기
  database: "jobcoach_db",
};

// CSV 한 파일을 읽어 배열로 돌려주는 함수 (BOM 제거 포함)
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

  // 다시 돌려도 중복 안 생기게 비우기
  await conn.query("TRUNCATE TABLE jobs");
  await conn.query("TRUNCATE TABLE ncs_duties");
  await conn.query("TRUNCATE TABLE departments");

  // 연봉/전망을 직업코드별로 정리
  const salaryRows = await readCsv("salary.csv");
  const salaryMap = {};
  for (const r of salaryRows) {
    salaryMap[r["직업코드"]] = { avg: r["평균연봉구간"], outlook: r["전망"] };
  }

  // jobs (직업정보 + 연봉 합쳐서)
  const jobRows = await readCsv("jobs.csv");
  const jobValues = jobRows.map((r) => {
    const s = salaryMap[r["직업코드"]] || {};
    return [r["직업코드"], r["직업명"], r["직업분류코드"], r["직업분류명"], s.avg || null, s.outlook || null];
  });
  await conn.query(
    "INSERT INTO jobs (jobCode, jobName, categoryCode, categoryName, avgSalary, outlook) VALUES ?",
    [jobValues]
  );
  console.log(`jobs: ${jobValues.length}건`);

  // ncs_duties (직업-직무 통합정보)
  const ncsRows = await readCsv("job_ncs.csv");
  const ncsValues = ncsRows.map((r) => [
    r["직업코드"], r["직업명"], r["능력단위코드"], r["NCS능력단위명"],
    r["NCS능력단위정의"], r["NCS대분류"], r["NCS중분류"], r["NCS소분류"],
  ]);
  await conn.query(
    "INSERT INTO ncs_duties (jobCode, jobName, ncsCode, dutyName, definition, majorCat, midCat, minorCat) VALUES ?",
    [ncsValues]
  );
  console.log(`ncs_duties: ${ncsValues.length}건`);

  // departments (학과정보)
  const deptRows = await readCsv("departments.csv");
  const deptValues = deptRows.map((r) => [
    r["학과구분"], r["세부학과명"], r["학과명"], r["계열ID"], r["학과ID"],
  ]);
  await conn.query(
    "INSERT INTO departments (deptCategory, detailName, deptName, seriesId, deptId) VALUES ?",
    [deptValues]
  );
  console.log(`departments: ${deptValues.length}건`);

  await conn.end();
  console.log("전부 완료!");
}

main().catch((err) => {
  console.error("에러:", err);
  process.exit(1);
});