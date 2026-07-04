const express = require('express');
const router = express.Router();

const userController = require('./user.controller');
const auth = require('../../middleware/auth');

router.get('/', userController.getAllUsers);
router.get('/me', auth, userController.getMe);

module.exports = router;