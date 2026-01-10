// src/services/metricsService.js
const { redisClient } = require('../config/redis');

// RAM'de tutulan veriler
const clientsMetrics = new Map();

// Redis'e yazarken kullanılacak prefix
const METRIC_PREFIX = 'metrics:';

const metricsService = {

  /**
   * Sağlık Puanı Hesapla (0 - 100)
   * Formül: 100 - (Loss * 5) - (Jitter * 0.1)
   */
  calculateHealthScore(jitter, packetLoss) {
    let score = 100;

    // 1. Packet Loss Cezası (Her %1 kayıp = -5 Puan)
    score -= (packetLoss * 5);

    // 2. Jitter Cezası (Her 1 ms jitter = -0.5 Puan)
    score -= (jitter * 0.5);

    // Sınırları Koru (0 ile 100 arasında kalmalı)
    return Math.max(0, Math.min(100, Math.round(score)));
  },

  async calculateMetrics(socketId, clientTimestamp, seqNum, sessionId, simulatedMetrics = {}) {
    const serverTimestamp = Date.now();
    let metrics = clientsMetrics.get(socketId);

    // --- BAŞLANGIÇ (INITIAL STATE) ---
    if (!metrics) {
      metrics = {
        sessionId: sessionId || 'unknown',
        prevServerTime: serverTimestamp,
        prevClientTime: clientTimestamp,
        jitter: 0,
        lastSeqNum: seqNum,
        totalPackets: 1,
        lostPackets: 0,
        healthScore: 0
      };
      clientsMetrics.set(socketId, metrics);

      // İlk pakette hesaplama yapma, direkt 0 dön (Cold Start)
      return { ...metrics, socketId };
    }

    // Eğer daha önce session ID kaydedilmemişse (veya unknown ise) güncelle
    if (sessionId && metrics.sessionId === 'unknown') {
      metrics.sessionId = sessionId;
    }

    // --- 1. PACKET LOSS HESABI ---
    const expectedSeqNum = metrics.lastSeqNum + 1;
    if (seqNum > expectedSeqNum) {
      metrics.lostPackets += (seqNum - expectedSeqNum);
    }
    metrics.totalPackets++;
    metrics.lastSeqNum = seqNum;

    // Gerçek Hesaplanan Kayıp Oranı
    const totalSent = metrics.totalPackets + metrics.lostPackets;
    let calculatedLoss = 0;
    if (totalSent > 0) {
      calculatedLoss = (metrics.lostPackets / totalSent) * 100;
    }

    // SİMÜLASYON ETKİSİ: Gerçek kayıp ile simülasyon kaybından hangisi büyükse onu al
    // (Böylece slider'ı artırınca loss artar, azaltınca gerçek değere döner)
    const finalPacketLoss = Math.max(calculatedLoss, simulatedMetrics.packetLoss || 0);

    // --- 2. JITTER HESABI ---
    const timeDiff = (serverTimestamp - metrics.prevServerTime) - (clientTimestamp - metrics.prevClientTime);

    // Gerçek Jitter (EMA ile yumuşatma)
    let calculatedJitter = metrics.jitter + (Math.abs(timeDiff) - metrics.jitter) / 16;

    // SİMÜLASYON ETKİSİ: Jitter üzerine ekleme yap
    const finalJitter = calculatedJitter + (simulatedMetrics.jitter || 0);

    // Durum değişkenlerini güncelle (Gerçek değerleri sakla ki hesap şaşmasın)
    metrics.jitter = calculatedJitter;
    metrics.prevServerTime = serverTimestamp;
    metrics.prevClientTime = clientTimestamp;

    // --- 3. HEALTH SCORE (Canlı Hesaplama) ---
    // Hesaplamada son kararlaştırılan (final) değerleri kullan
    metrics.healthScore = this.calculateHealthScore(finalJitter, finalPacketLoss);

    // Güncel veriyi Map'e kaydet
    clientsMetrics.set(socketId, metrics);

    // --- 4. REDIS'E KAYDET ---
    const redisData = JSON.stringify({
      sessionId: metrics.sessionId,
      jitter: finalJitter.toFixed(2),        // DÜZELTME: finalJitter kullanıldı
      packetLoss: finalPacketLoss.toFixed(2), // DÜZELTME: finalPacketLoss kullanıldı
      score: metrics.healthScore,
      lastUpdated: Date.now()
    });

    redisClient.set(`${METRIC_PREFIX}${socketId}`, redisData, 'EX', 60).catch(err => {
      console.error('Redis Metric Write Error:', err);
    });

    // --- RETURN ---
    return {
      socketId: socketId,
      sessionId: metrics.sessionId,
      jitter: parseFloat(finalJitter.toFixed(3)),
      packetLoss: parseFloat(finalPacketLoss.toFixed(2)),
      healthScore: metrics.healthScore
    };
  },

  removeClient(socketId) {
    clientsMetrics.delete(socketId);
    redisClient.del(`${METRIC_PREFIX}${socketId}`);
  }
};

module.exports = metricsService;