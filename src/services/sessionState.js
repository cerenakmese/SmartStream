const { redisClient, redlock } = require('../config/redis');

// Sabitler
const SESSION_TTL = 24 * 60 * 60; // 24 Saat
const LOCK_TTL = 5000; // 5 saniye

class SessionStateService {
  
  async createSessionState(sessionId, hostUserId, nodeId) {
    const key = `session:${sessionId}`;
    const lockKey = `lock:${sessionId}`;
    let lock = null;

    console.log(`[DEBUG] 1. createSessionState başladı: ${sessionId}`);

    try {
      // 1. Kilit Almaya Çalış (Redlock)
      // Redlock v5 uyumluluğu için try-catch içine alıyoruz
      try {
        if (redlock) {
            console.log('[DEBUG] 2. Redlock kilit alınıyor...');
            lock = await redlock.acquire([lockKey], LOCK_TTL);
            console.log('[DEBUG] 3. Kilit alındı!');
        } else {
            console.log('[DEBUG] UYARI: Redlock tanımlı değil, kilit atlanıyor.');
        }
      } catch (lockError) {
        console.error('[DEBUG] Kilit Hatası (Önemli değil, devam ediliyor):', lockError.message);
        // Kilit alınamazsa bile işlemi durdurmayalım (Test aşaması için)
      }

      // 2. Redis Kontrolü
      console.log('[DEBUG] 4. Redis exists kontrolü...');
      const exists = await redisClient.exists(key);
      if (exists) {
        throw new Error('Bu Session ID zaten kullanımda.');
      }

      // 3. Obje Hazırlığı
      const sessionState = {
        id: sessionId,
        participants: [],
        nodeId: nodeId || 'unknown-node',
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
        networkMetrics: { jitter: 0, packetLoss: 0, bandwidth: 0 }
      };

      // 4. Redis'e Yazma
      console.log('[DEBUG] 5. Redis set işlemi...');
      await redisClient.set(key, JSON.stringify(sessionState), 'EX', SESSION_TTL);
      
      console.log(`[DEBUG] 6. BAŞARILI! Redis key: ${key}`);
      return sessionState;

    } catch (error) {
      console.error('[DEBUG] Servis İçi Kritik Hata:', error);
      throw error; // Hatayı yukarı fırlat ki API bilsin
    } finally {
      // 5. Kilidi Kaldır
      if (lock) {
        try {
            console.log('[DEBUG] 7. Kilit serbest bırakılıyor...');
            await lock.release();
        } catch (e) {
            // Kilit zaten kalkmışsa hata verebilir, yoksay.
        }
      }
    }
  }

  // --- Diğer metodlar şimdilik aynı kalabilir veya boş bırakılabilir ---
  async getSessionState(sessionId) { return null; }
  async addParticipant(sessionId, userId) { return null; }
}

module.exports = new SessionStateService();