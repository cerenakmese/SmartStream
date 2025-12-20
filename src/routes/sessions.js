const express = require('express');
const router = express.Router();
const sessionStateService = require('../services/sessionState');
const auth = require('../middleware/auth');
const SessionModel = require('../models/Session'); 
const CallLogModel = require('../models/CallLog'); // 👈 EKLENDİ

// 1. Oturum Oluştur
router.post('/create', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const hostId = req.user.userId || req.user.id || req.user._id;

    if (!sessionId) throw new Error('sessionId eksik!');
    
    const session = await sessionStateService.createSessionState(
        sessionId, 
        hostId, 
        process.env.HOSTNAME || 'localhost'
    );
    
    res.json({ success: true, session });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 2. Oturum Bilgisini Getir (Canlı Durum)
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const state = await sessionStateService.getSessionState(sessionId);

    if (state) {
      res.json({ success: true, data: state });
    } else {
      res.status(404).json({ success: false, error: 'Oturum aktif değil.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Oturumu Sonlandır (Kapat ve Arşivle)
router.post('/end', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) throw new Error('sessionId gerekli!');

    await sessionStateService.deleteSession(sessionId);

    res.json({ success: true, message: 'Oturum başarıyla kapatıldı ve raporlandı.' });

  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 👇 YENİ: 4. DASHBOARD RAPORU ÇEK
router.get('/:sessionId/metrics', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // A) Özet Rapor (Session Tablosu)
    const sessionSummary = await SessionModel.findOne({ sessionId: sessionId });
    
    if (!sessionSummary) {
        return res.status(404).json({ success: false, error: 'Oturum kaydı bulunamadı.' });
    }

    // B) Detaylı Olay Geçmişi (CallLog Tablosu)
    const historyLogs = await CallLogModel.find({ sessionId: sessionId }).sort({ timestamp: -1 });

    // C) Birleştirip Gönder
    res.json({
        success: true,
        summary: {
            status: sessionSummary.status,
            startTime: sessionSummary.startTime,
            endTime: sessionSummary.endTime,
            duration: sessionSummary.metricsSummary.totalDuration + ' sn',
            finalHealthScore: sessionSummary.metricsSummary.averageHealthScore,
            packetLoss: sessionSummary.metricsSummary.averagePacketLoss,
            jitter: sessionSummary.metricsSummary.averageJitter
        },
        events: historyLogs // Hata ve kalite raporları burada
    });

  } catch (error) {
    console.error('Metrics API Hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;