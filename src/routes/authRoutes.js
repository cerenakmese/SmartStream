const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Kullanıcı Kaydı Rotası
router.post('/register', authController.register);

// İleride Login de buraya gelecek
// router.post('/login', authController.login);

module.exports = router;