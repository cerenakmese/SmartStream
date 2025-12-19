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

  /**
   * Ana Hesaplama Fonksiyonu
   */
  async calculateMetrics(socketId, clientTimestamp, seqNum) {
    const serverTimestamp = Date.now();
    let metrics = clientsMetrics.get(socketId);

    // --- BAŞLANGIÇ (INITIAL STATE) ---
    if (!metrics) {
      metrics = {
        prevServerTime: serverTimestamp,
        prevClientTime: clientTimestamp,
        jitter: 0,
        lastSeqNum: seqNum,
        totalPackets: 1,
        lostPackets: 0,
        healthScore: 0 // DÜZELTME: Başlangıçta 0 (Henüz akış oturmadı)
      };
      clientsMetrics.set(socketId, metrics);

      // İlk pakette hesaplama yapma, direkt 0 dön (Cold Start)
      return metrics;
    }

    // --- 1. PACKET LOSS ---
    const expectedSeqNum = metrics.lastSeqNum + 1;
    if (seqNum > expectedSeqNum) {
      metrics.lostPackets += (seqNum - expectedSeqNum);
    }
    metrics.totalPackets++;
    metrics.lastSeqNum = seqNum;

    // Loss Oranı Hesapla
    const totalSent = metrics.totalPackets + metrics.lostPackets;
    const packetLoss = (metrics.lostPackets / totalSent) * 100;

    // --- 2. JITTER ---
    const timeDiff = (serverTimestamp - metrics.prevServerTime) - (clientTimestamp - metrics.prevClientTime);
    // Exponential Moving Average (EMA) ile yumuşatma
    metrics.jitter = metrics.jitter + (Math.abs(timeDiff) - metrics.jitter) / 16;

    metrics.prevServerTime = serverTimestamp;
    metrics.prevClientTime = clientTimestamp;

    // --- 3. HEALTH SCORE (Canlı Hesaplama) ---
    // Artık veri akıyor, 100 üzerinden puan kırarak hesapla
    metrics.healthScore = this.calculateHealthScore(metrics.jitter, packetLoss);

    // Güncel veriyi Map'e kaydet
    clientsMetrics.set(socketId, metrics);

    // --- 4. REDIS'E KAYDET ---
    const redisData = JSON.stringify({
      jitter: metrics.jitter.toFixed(2),
      packetLoss: packetLoss.toFixed(2),
      score: metrics.healthScore,
      lastUpdated: Date.now()
    });

    redisClient.set(`${METRIC_PREFIX}${socketId}`, redisData, 'EX', 60).catch(err => {
      console.error('Redis Metric Write Error:', err);
    });

    return {
      jitter: parseFloat(metrics.jitter.toFixed(3)),
      packetLoss: parseFloat(packetLoss.toFixed(2)),
      healthScore: metrics.healthScore
    };
  },

  removeClient(socketId) {
    clientsMetrics.delete(socketId);
    redisClient.del(`${METRIC_PREFIX}${socketId}`);
  }
};

module.exports = metricsService;