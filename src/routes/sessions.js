const express = require('express');
const router = express.Router();
const sessionStateService = require('../services/sessionState');

// 1. Oturum Oluştur (POST)
router.post('/create', async (req, res) => {
  try {
    console.log('Gelen İstek Body:', req.body);

    const { sessionId, hostId } = req.body;

    // Eksik veri kontrolü
    if (!sessionId || !hostId) {
        throw new Error('sessionId veya hostId eksik!');
    }
    
    const session = await sessionStateService.createSessionState(
        sessionId, 
        hostId, 
        process.env.HOSTNAME || 'localhost'
    );
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Session Create Hatası:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// 2. Oturum Bilgisini Getir (GET) - YENİ EKLENEN KISIM
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Servis katmanından veriyi iste (Redis'ten okur)
    const state = await sessionStateService.getSessionState(sessionId);

    if (state) {
      res.json({ success: true, data: state });
    } else {
      res.status(404).json({ success: false, error: 'Oturum bulunamadı veya süresi doldu.' });
    }
  } catch (error) {
    console.error('Session Get Hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;