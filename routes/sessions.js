const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// POST /api/sessions/create -> Yeni oda kur
router.post('/create', sessionController.createSession);

// GET /api/sessions/:id -> Odaya katıl/bilgi al
router.get('/:id', sessionController.joinSession);

// POST /api/sessions/:id/heartbeat -> Odayı canlı tut
router.post('/:id/heartbeat', sessionController.heartbeat);

module.exports = router;