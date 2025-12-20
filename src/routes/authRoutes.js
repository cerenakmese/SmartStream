const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Kullanıcı Kaydı Rotası
router.post('/register', authController.register);

// Kullanıcı Giriş Rotası
router.post('/login', authController.login);

module.exports = router;