const express = require('express');
const router = express.Router();

const userController = require('./user.controller');
const mypageController = require('../mypage/mypage.controller');
const auth = require('../../middleware/auth');

router.get('/me/activity', auth, mypageController.getActivity);
router.post('/me/password', auth, userController.changePassword);
router.patch('/me', auth, userController.updateProfile);
router.get('/me', auth, userController.getMe);
router.get('/', userController.getAllUsers);

module.exports = router;