const express = require('express');
const router = express.Router();
const interviewController = require('./interview.controller');

router.post('/questions', interviewController.generateQuestions);
router.post('/feedback', interviewController.evaluateAnswer);

module.exports = router;