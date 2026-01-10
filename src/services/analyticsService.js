// src/services/analyticsService.js
const CallLog = require('../models/CallLog');

const analyticsService = {

  /**
   * Kritik QoS Olayını Kaydet (Örn: Video Kapatıldı)
   */
  async logQoSEvent(sessionId, nodeId, metrics, decision) {
    try {
      // Sadece 'CRITICAL' veya 'WARNING' durumlarını kaydedelim ki veritabanı şişmesin
      if (decision.status === 'STABLE') return;

      console.log(` [Analytics] QoS Olayı Kaydediliyor: ${decision.action}`);

      const newLog = new CallLog({
        sessionId: sessionId, // Hangi oda?
        nodeId: nodeId,       // Hangi sunucu?
        event: 'quality_report',

        // O anki ağ durumu
        metrics: {
          averageJitter: metrics.jitter,
          averagePacketLoss: metrics.packetLoss,
          healthScore: metrics.healthScore
        },

        // Alınan önlem
        qosEvents: [{
          timestamp: new Date(),
          action: decision.action, // Örn: DROP_VIDEO
          reason: decision.reason, // Örn: High Packet Loss
          socketId: metrics.socketId
        }],

        reportedByNode: nodeId
      });

      await newLog.save();

    } catch (error) {
      console.error(' [Analytics] Log Yazma Hatası:', error);
    }
  },

  /**
   * Oturum Başlangıcını Kaydet (Opsiyonel - Session tablosu zaten tutuyor ama log olsun)
   */
  async logSessionStart(sessionId, nodeId) {
    try {
      await CallLog.create({
        sessionId,
        nodeId,
        event: 'session_start'
      });
    } catch (e) { console.error(e); }
  },

  async getLogs(filter = {}, limit = 50) {
    try {
      // En yeniden eskiye doğru sırala
      return await CallLog.find(filter)
        .sort({ timestamp: -1 })
        .limit(limit);
    } catch (error) {
      throw new Error('Loglar çekilemedi: ' + error.message);
    }
  },


};


module.exports = analyticsService;