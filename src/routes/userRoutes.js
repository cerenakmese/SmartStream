const express = require('express');
const router = express.Router();
const { getUserProfile } = require('../controllers/userController');
const protect = require('../middleware/auth');  // Token kontrolü yapan middleware
const auth = require('../middleware/auth');
const userController = require('../controllers/userController'); 

// GET isteği geldiğinde önce 'protect' çalışsın (token kontrolü),
// sonra 'getUserProfile' çalışsın.

router.get('/profile', protect, getUserProfile);
router.put('/settings', auth, userController.updateSettings);

module.exports = router;