const { redisClient, redlock } = require('../config/redis');
const SessionModel = require('../models/Session');
const qosEngine = require('./qosEngine');
const User = require('../models/User');
const analyticsService = require('./analyticsService');

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 3600; // 1 saat

const RECOVERY_PREFIX = 'user:recovery:';
const RECOVERY_TTL = 120; // 2 dakika (Bağlantı koptuktan sonra 2 dk hatırla)

const sessionStateService = {



  // --- 1. OTURUM OLUŞTURMA ---
  async createSessionState(sessionId, hostId, nodeId) {
    const lockKey = `locks:create-session:${sessionId}`;
    let lock = null;

    try {
      lock = await redlock.acquire([lockKey], 5000);
      const exists = await redisClient.exists(`${SESSION_PREFIX}${sessionId}`);
      if (exists) throw new Error('Bu ID ile zaten aktif bir oturum var.');

      // KULLANICI GÜNCELLEMESİ: Node ID gelmezse varsayılan olarak 'smartstream-api-2' ata
      // (Not: Docker Compose'daki HOSTNAME ile uyumlu olduğundan emin ol)
      const targetNode = nodeId || 'smartstream-api-2';

      const sessionData = {
        id: sessionId,
        hostId: hostId,
        nodeId: targetNode,
        createdAt: Date.now(),
        status: 'active',
        networkMetrics: JSON.stringify({ jitter: 0, packetLoss: 0, healthScore: 100 }),
        participants: JSON.stringify([])
      };

      await redisClient.hmset(`${SESSION_PREFIX}${sessionId}`, sessionData);
      await redisClient.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);

      if (targetNode && targetNode !== 'none') {
        await redisClient.hincrby(`node:${targetNode}`, 'load', 1);
        console.log(`[SessionState] Node Yükü Artırıldı: ${targetNode}`);
      }

      const newSessionLog = new SessionModel({
        sessionId: sessionId,
        hostId: hostId,
        nodeId: targetNode,
        status: 'active',
        startTime: new Date()
      });
      await newSessionLog.save();
      console.log(`[MongoDB] Yeni Session Kaydedildi: ${sessionId} (Node: ${targetNode})`);
      analyticsService.logSessionStart(sessionId, targetNode).catch(err => console.error(err));

      return {
        ...sessionData,
        participants: [],
        userExperiences: [], // Frontend uyumluluğu için
        networkMetrics: { jitter: 0, packetLoss: 0, healthScore: 100 }
      };

    } catch (error) {
      console.error('Create Session Error:', error);
      throw error;
    } finally {
      if (lock) await lock.release().catch(e => { });
    }
  },


  async getSessionState(sessionId) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const data = await redisClient.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    try {
      // Katılımcıları Parse Et
      if (data.participants) data.participants = JSON.parse(data.participants);

      // --- USER EXPERIENCES LİSTESİNİ OLUŞTUR ---
      const userExperiences = [];
      const keysToDelete = []; // Cevabı kirleten ham veriler

      for (const [field, value] of Object.entries(data)) {
        // "metrics:USER_ID" formatındaki alanları bul
        if (field.startsWith('metrics:')) {
          const userId = field.split(':')[1];
          let metricsObj = {};

          try {
            metricsObj = JSON.parse(value);
          } catch (e) { console.error('JSON Parse Hatası:', e); }

          // QoS Kararını Hesapla
          let decision = null;
          if (qosEngine && typeof qosEngine.determineQualityStrategy === 'function') {
            decision = qosEngine.determineQualityStrategy(
              { metrics: metricsObj }, // Analiz verisi
              { qosPreference: metricsObj.qosPreference || 'balanced' } // Kullanıcı tercihi
            );
          }

          userExperiences.push({
            userId: userId,
            metrics: metricsObj,
            qosDecision: decision
          });

          // Ham veriyi listeden temizle (Frontend kafası karışmasın)
          keysToDelete.push(field);
        }
      }

      // Ham anahtarları ve eski global alanları geçici objeden sil
      keysToDelete.forEach(k => delete data[k]);
      delete data.networkMetrics;

      // Temiz listeyi ekle
      data.userExperiences = userExperiences;

    } catch (e) { console.error('Parse Error:', e); }

    return data;
  },

  // --- 2. KATILIMCI EKLEME (GÜNCELLENDİ: Varsayılan Metrik Oluşturma) ---
  async addParticipant(sessionId, user) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const exists = await redisClient.exists(key);
    if (!exists) throw new Error('Oturum bulunamadı!');

    let participants = [];
    const data = await redisClient.hget(key, 'participants');
    if (data) participants = JSON.parse(data);

    const alreadyJoined = participants.find(p => p.userId === user.userId);

    if (!alreadyJoined) {
      // Listeye ekle
      participants.push({ userId: user.userId, username: user.username || 'Anonim', joinedAt: Date.now() });
      await redisClient.hset(key, 'participants', JSON.stringify(participants));

      let userPref = 'balanced';
      try {
        const dbUser = await User.findById(user.userId).select('settings');
        if (dbUser && dbUser.settings && dbUser.settings.qosPreference) {
          userPref = dbUser.settings.qosPreference;
        }
      } catch (err) { console.error('User pref fetch error:', err); }


      const defaultMetrics = {
        jitter: 0,
        packetLoss: 0,
        healthScore: 100,
        qosPreference: userPref, // Varsayılan tercih
        updatedAt: Date.now(),
        isSimulated: false
      };

      // Redis'e "metrics:USERID" olarak kaydet
      await redisClient.hset(key, `metrics:${user.userId}`, JSON.stringify(defaultMetrics));
    }

    await redisClient.set(`${RECOVERY_PREFIX}${user.userId}`, sessionId, 'EX', RECOVERY_TTL);
    return participants;
  },


  async updateUserPreferenceOnly(sessionId, userId, newPreference) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const field = `metrics:${userId}`;

    // Mevcut veriyi al, bozmadan sadece tercihi değiştir
    const rawData = await redisClient.hget(key, field);
    if (rawData) {
      const metrics = JSON.parse(rawData);
      metrics.qosPreference = newPreference;

      await redisClient.hset(key, field, JSON.stringify(metrics));
      return true;
    }
    return false;
  },

  // --- 3. KİŞİYE ÖZEL METRİK GÜNCELLEME ---
  async updateUserMetrics(sessionId, userId, metrics) {
    const key = `${SESSION_PREFIX}${sessionId}`;
    const exists = await redisClient.exists(key);
    if (!exists) throw new Error('Oturum bulunamadı.');

    const fieldName = `metrics:${userId}`;
    await redisClient.hset(key, fieldName, JSON.stringify(metrics));
    return metrics;
  },

  async recoverUserSession(userId) {
    const sessionId = await redisClient.get(`${RECOVERY_PREFIX}${userId}`);
    if (sessionId) {
      // Oturum hala aktif mi diye kontrol et (Belki silinmiştir)
      const exists = await redisClient.exists(`${SESSION_PREFIX}${sessionId}`);
      if (exists) {
        console.log(`[SessionState] ♻️ Kullanıcı oturumu kurtarıldı: ${userId} -> ${sessionId}`);
        // Kurtarma başarılıysa süreyi tekrar uzat (2 dk daha)
        await redisClient.expire(`${RECOVERY_PREFIX}${userId}`, RECOVERY_TTL);
        return sessionId;
      }
    }
    return null;
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

      if (participants.length === 0) {
        console.log(`[Session] Oda boşaldı, otomatik kapatılıyor: ${sessionId}`);
        await this.deleteSession(sessionId); // Odayı yok et
        return; // İşlem bitti
      }
    }

    // Kullanıcı bilerek çıkış yaptıysa (Logout), recovery bilgisini silmeliyiz.
    // Ki bir daha bağlandığında yanlışlıkla eski odaya girmesin.
    await redisClient.del(`${RECOVERY_PREFIX}${userId}`);

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

    if (assignedNodeId && assignedNodeId !== 'none') {
      await redisClient.hincrby(`node:${assignedNodeId}`, 'load', -1);
      console.log(`[SessionState] 📉 Node Yükü Azaltıldı: ${assignedNodeId}`);
    }

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
          nodeId: data.nodeId,
          participantCount: data.participants ? JSON.parse(data.participants).length : 0,
          status: data.status
        });
      }
    }
    return sessions;
  }
}; // Obje kapanışı

module.exports = sessionStateService;