const express = require('express');
const router = express.Router();
const { getUserProfile } = require('../controllers/userController');
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');


router.get('/profile', auth, getUserProfile);
router.put('/settings', auth, userController.updateSettings);

module.exports = router;