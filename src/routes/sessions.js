const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const auth = require('../middleware/auth'); // Token kontrolü şart

// --- ENDPOINT TANIMLARI ---

// 1. Oturum Başlat
// POST /api/sessions/init
router.post('/init', auth, sessionController.createSession);

// 2. Aktif Oturumları Listele (Bunu :id'den önce koymalıyız ki çakışmasın)
// GET /api/sessions/active
router.get('/active', auth, sessionController.listActiveSessions);

// 3. Oturum Durumunu Çek
// GET /api/sessions/:id/state
router.get('/:id/state', auth, sessionController.getSessionState);

// 4. Oturuma Katıl
// POST /api/sessions/:id/join
router.post('/:id/join', auth, sessionController.joinSession);

// 5. Oturumdan Ayrıl
// POST /api/sessions/:id/leave
router.post('/:id/leave', auth, sessionController.leaveSession);

// 6. Kalp Atışı (Heartbeat)
// POST /api/sessions/:id/heartbeat
router.post('/:id/heartbeat', auth, sessionController.heartbeat);

module.exports = router;