const express = require('express');
const router = express.Router();
const interviewController = require('./interview.controller');
const auth = require('../../middleware/auth'); // auth 인증 미들웨어

router.post('/questions', auth, interviewController.generateQuestions);
router.post('/feedback', auth, interviewController.evaluateAnswer); // auth 다시 적용

module.exports = router;