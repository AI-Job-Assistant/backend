const express = require('express');
const router = express.Router();
const interviewController = require('./interview.controller');
const auth = require('../../middleware/auth');   // ← 추가

router.post('/questions', auth, interviewController.generateQuestions);   // ← auth 추가
router.post('/feedback', auth, interviewController.evaluateAnswer);       // ← auth 추가

module.exports = router;