const { redisClient, redlock } = require('../config/redis');
const SessionModel = require('../models/Session'); 

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 3600; // 1 saat

const sessionStateService = {
  
  // --- 1. OTURUM OLUŞTURMA ---
  async createSessionState(sessionId, hostId, nodeId) {
    const lockKey = `locks:create-session:${sessionId}`;
    let lock = null;

    try {
      lock = await redlock.acquire([lockKey], 5000);
      const exists = await redisClient.exists(`${SESSION_PREFIX}${sessionId}`);
      if (exists) throw new Error('Bu ID ile zaten aktif bir oturum var.');

      const sessionData = {
        id: sessionId,
        hostId: hostId,
        nodeId: nodeId,
        createdAt: Date.now(),
        status: 'active',
        networkMetrics: JSON.stringify({ jitter: 0, packetLoss: 0, bandwidth: 0, healthScore: 100 }),
        participants: JSON.stringify([]) 
      };

      await redisClient.hmset(`${SESSION_PREFIX}${sessionId}`, sessionData);
      await redisClient.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);

      const newSessionLog = new SessionModel({
        sessionId: sessionId,
        hostId: hostId,
        nodeId: nodeId,
        status: 'active',
        startTime: new Date()
      });
      await newSessionLog.save();
      console.log(`[MongoDB] Yeni Session Kaydedildi: ${sessionId}`);

      return { ...sessionData, participants: [], networkMetrics: { jitter: 0, packetLoss: 0, healthScore: 100 } };

    } catch (error) {
      console.error('Create Session Error:', error);
      throw error;
    } finally {
      if (lock) await lock.release().catch(e => {});
    }
  },

  // --- 2. OTURUM BİLGİSİ ÇEKME ---
  async getSessionState(sessionId) {
    const data = await redisClient.hgetall(`${SESSION_PREFIX}${sessionId}`);
    if (!data || Object.keys(data).length === 0) return null;
    
    try {
        if (data.participants) data.participants = JSON.parse(data.participants);
        if (data.networkMetrics) data.networkMetrics = JSON.parse(data.networkMetrics);
    } catch (e) { console.error('Parse Error:', e); }
    
    return data;
  },

  // --- 3. KATILIMCI EKLEME ---
  async addParticipant(sessionId, user) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const exists = await redisClient.exists(key);
    if (!exists) throw new Error('Oturum bulunamadı!');

    let participants = [];
    const data = await redisClient.hget(key, 'participants');
    if (data) participants = JSON.parse(data);

    const alreadyJoined = participants.find(p => p.userId === user.userId);
    if (!alreadyJoined) {
        participants.push({ userId: user.userId, username: user.username || 'Anonim', joinedAt: Date.now() });
        await redisClient.hset(key, 'participants', JSON.stringify(participants));
    }
    return participants;
  },

  // --- 4. KATILIMCI ÇIKARMA ---
  async removeParticipant(sessionId, userId) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    let participants = [];
    const data = await redisClient.hget(key, 'participants');
    if (data) {
        participants = JSON.parse(data);
        participants = participants.filter(p => p.userId !== userId);
        await redisClient.hset(key, 'participants', JSON.stringify(participants));
    }
  },

  // --- 5. OTURUMU SONLANDIR (TEMİZLİK VE ARŞİVLEME) ---
  async deleteSession(sessionId) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    
    // 1. Redis'ten "Son Kez" veriyi çek (Karne verisi)
    const sessionData = await redisClient.hgetall(key);
    
    if (!sessionData || Object.keys(sessionData).length === 0) {
        throw new Error('Oturum zaten kapalı veya bulunamadı.');
    }

    // 2. Metrikleri Ayrıştır
    let finalMetrics = { jitter: 0, packetLoss: 0, healthScore: 100 };
    if (sessionData.networkMetrics) {
        try {
            finalMetrics = JSON.parse(sessionData.networkMetrics);
        } catch (e) { console.error('Metrik parse hatası:', e); }
    }

    // 3. Süreyi Hesapla
    const startTime = parseInt(sessionData.createdAt || Date.now());
    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;

    // 4. Redis'ten Sil
    await redisClient.del(key);

    // 5. MongoDB'ye "Final Raporu" ile Kaydet
    await SessionModel.findOneAndUpdate(
        { sessionId: sessionId },
        { 
            status: 'ended', 
            endTime: new Date(endTime),
            metricsSummary: {
                averageJitter: finalMetrics.jitter || 0,
                averagePacketLoss: finalMetrics.packetLoss || 0,
                averageHealthScore: finalMetrics.healthScore || 100,
                totalDuration: durationSeconds
            }
        }
    );

    console.log(` [Session] Oturum Arşivlendi ve Kapatıldı: ${sessionId}`);
    return true;
  },
  
// ... Mevcut kodlar ...

  // --- 6. KALP ATIŞI (SÜRE UZATMA) ---
  async updateHeartbeat(sessionId) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const exists = await redisClient.exists(key);
    if (!exists) throw new Error('Oturum bulunamadı.');
    
    // Süreyi tekrar 1 saat yap
    await redisClient.expire(key, SESSION_TTL);
    return true;
  },

  // --- 7. TÜM AKTİF OTURUMLARI LİSTELE ---
  async getAllActiveSessions() {
    // Redis'te 'session:*' ile başlayan anahtarları bul
    const keys = await redisClient.keys(`${SESSION_PREFIX}*`);
    const sessions = [];

    for (const key of keys) {
      const data = await redisClient.hgetall(key);
      if (data) {
        // ID'yi key'den ayıkla (session:room-123 -> room-123)
        sessions.push({
          sessionId: data.id,
          hostId: data.hostId,
          participantCount: data.participants ? JSON.parse(data.participants).length : 0,
          status: data.status
        });
      }
    }
    return sessions;
  }
}; // Obje kapanışı

module.exports = sessionStateService;