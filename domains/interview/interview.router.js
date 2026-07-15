const express = require('express');
const router = express.Router();
const interviewController = require('./interview.controller');
const auth = require('../../middleware/auth');

router.post('/questions', auth, interviewController.generateQuestions);
router.post('/feedback', auth, interviewController.evaluateAnswer);
router.get('/:id', auth, interviewController.getInterviewById);

module.exports = router;