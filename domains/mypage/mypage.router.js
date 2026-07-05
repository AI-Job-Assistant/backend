const express = require('express');
const router = express.Router();
const mypageController = require('./mypage.controller');

router.get('/stats', mypageController.getStats);
router.get('/history', mypageController.getHistory);
router.get('/heatmap', mypageController.getHeatmap);
router.get('/analysis', mypageController.getAnalysis);

module.exports = router;