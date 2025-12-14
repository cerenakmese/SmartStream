const express = require('express');
const router = express.Router();
const sessionStateService = require('../services/sessionState');

router.post('/create', async (req, res) => {
  try {
    // 1. Gelen veriyi konsola yazdıralım (Hata ayıklama)
    console.log('Gelen İstek Body:', req.body);

    const { sessionId, hostId } = req.body;

    // 2. Eksik veri kontrolü (Çökmemesi için)
    if (!sessionId || !hostId) {
        throw new Error('sessionId veya hostId eksik!');
    }
    
    const session = await sessionStateService.createSessionState(sessionId, hostId, process.env.HOSTNAME || 'localhost');
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Session Create Hatası:', error); // Hatayı terminale bas
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;