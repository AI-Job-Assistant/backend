const express = require('express');
const router = express.Router();
const mypageController = require('./mypage.controller');
const auth = require('../../middleware/auth');

router.get('/stats', auth, mypageController.getStats);
router.get('/history', auth, mypageController.getHistory);
router.get('/heatmap', auth, mypageController.getHeatmap);
router.get('/analysis', auth, mypageController.getAnalysis);

module.exports = router;