const express = require('express');
const router = express.Router();

const userController = require('./user.controller');

router.post('/signup', userController.signup);
router.post('/login', userController.login);

router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

module.exports = router;