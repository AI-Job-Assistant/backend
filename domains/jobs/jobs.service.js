const pool = require('../../config/db');

const getJobs = async () => {
  const [rows] = await pool.query(
    "SELECT id, jobCode, jobName, categoryName FROM jobs ORDER BY jobName"
  );
  return rows;
};

const getDepartments = async () => {
  const [rows] = await pool.query(
    "SELECT MIN(id) AS id, deptName FROM departments GROUP BY deptName ORDER BY deptName"
  );
  return rows;
};

const getJobNcs = async (id) => {
  const [rows] = await pool.query(
    `SELECT nd.id, nd.ncsCode, nd.dutyName, nd.definition,
            nd.majorCat, nd.midCat, nd.minorCat
     FROM ncs_duties nd
     JOIN jobs j ON j.jobCode = nd.jobCode
     WHERE j.id = ?`,
    [id]
  );
  return rows;
};

module.exports = { getJobs, getDepartments, getJobNcs };