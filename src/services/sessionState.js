const { redisClient, redlock } = require('../config/redis');

// Sabitler
const SESSION_PREFIX = 'session:'; // Anahtar ön eki
const SESSION_TTL = 24 * 60 * 60;  // 24 Saat
const LOCK_TTL = 5000;             // 5 saniye

class SessionStateService {

  // 1. OTURUM OLUŞTURMA
  async createSessionState(sessionId, hostUserId, nodeId) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const lockKey = `lock:${sessionId}`;
    let lock = null;

    console.log(`[DEBUG] Oluşturuluyor: ${key}`);

    try {
      // Kilit Al (Opsiyonel ama güvenli)
      try {
        if (redlock) {
            lock = await redlock.acquire([lockKey], LOCK_TTL);
        }
      } catch (e) { /* Kilit hatası önemsiz */ }

      // Redis'te var mı?
      const exists = await redisClient.exists(key);
      if (exists) {
        throw new Error('Bu Session ID zaten kullanımda.');
      }

      const sessionState = {
        id: sessionId,
        participants: [],
        nodeId: nodeId || 'unknown-node',
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
        networkMetrics: { jitter: 0, packetLoss: 0, bandwidth: 0 }
      };

      // Redis'e Yaz
      await redisClient.set(key, JSON.stringify(sessionState), 'EX', SESSION_TTL);
      return sessionState;

    } finally {
      if (lock) try { await lock.release(); } catch (e) {}
    }
  }

  // 2. OTURUM OKUMA (İŞTE EKSİK OLAN KISIM BURASIYDI)
  async getSessionState(sessionId) {
    try {
      // Doğru anahtar ismiyle (prefix ekleyerek) Redis'e soruyoruz
      const key = `${SESSION_PREFIX}${sessionId}`;
      const data = await redisClient.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis Okuma Hatası:', error);
      return null;
    }
  }
}

module.exports = new SessionStateService();