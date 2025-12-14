const express = require('express');
const router = express.Router();
const sessionStateService = require('../services/sessionState');

// Distributed Lock Test Rotası
router.post('/create', async (req, res) => {
  try {
    const { sessionId, hostId } = req.body;
    
    // Servisimizi çağırıyoruz (Burada Redlock devreye girecek)
    const session = await sessionStateService.createSessionState(sessionId, hostId, process.env.HOSTNAME);
    
    res.json({ success: true, session });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;