const jobsService = require('./jobs.service');

const getJobs = async (req, res) => {
  try {
    const rows = await jobsService.getJobs();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "직무 목록을 불러오지 못했습니다." });
  }
};

const getDepartments = async (req, res) => {
  try {
    const rows = await jobsService.getDepartments();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "학과 목록을 불러오지 못했습니다." });
  }
};

const getJobNcs = async (req, res) => {
  try {
    const rows = await jobsService.getJobNcs(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "NCS 능력단위를 불러오지 못했습니다." });
  }
};

module.exports = { getJobs, getDepartments, getJobNcs };