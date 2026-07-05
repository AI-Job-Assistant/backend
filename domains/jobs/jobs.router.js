const express = require('express');
const router = express.Router();
const jobsController = require('./jobs.controller');

router.get('/jobs', jobsController.getJobs);
router.get('/departments', jobsController.getDepartments);
router.get('/jobs/:id/ncs', jobsController.getJobNcs);

module.exports = router;
