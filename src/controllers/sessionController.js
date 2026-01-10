const sessionStateService = require('../services/sessionState');
const { redisClient } = require('../config/redis');
const metricsService = require('../services/metricsService');
const qosService = require('../services/qosService');

// 1. POST /api/sessions/init
exports.createSession = async (req, res) => {
  try {

    const hostId = req.user.userId || req.user.id || req.user._id;

    // 1. Redis'teki Aktif Node'ları Çek
    const activeNodeIds = await redisClient.smembers('active_nodes');

    let selectedNodeId = null;

    if (activeNodeIds.length > 0) {
      // --- SENARYO A: İŞÇİ VAR ---
      // Yükü en az olanı bul (Least Connections)
      let minLoad = Infinity;

      for (const nodeId of activeNodeIds) {
        const load = await redisClient.hget(`node:${nodeId}`, 'load');
        const currentLoad = load ? parseInt(load) : 0;

        if (currentLoad < minLoad) {
          minLoad = currentLoad;
          selectedNodeId = nodeId;
        }
      }

      // Seçilen işçinin yükünü artır
      await redisClient.hincrby(`node:${selectedNodeId}`, 'load', 1);
      console.log(`Session, Worker Node'a atandı: ${selectedNodeId}`);

    } else {
      // --- SENARYO B: HİÇ İŞÇİ YOK (FALLBACK) ---
      // Sistem çalışmaya devam etsin diye API sunucusu görevi üstlenir
      console.warn('UYARI: Aktif node bulunamadı! Session API sunucusunda başlatılıyor.');
      selectedNodeId = process.env.HOSTNAME || 'local-api-node';
    }

    // 2. Session Oluştur
    const sessionId = req.body.sessionId || `room-${Date.now()}`;
    const session = await sessionStateService.createSessionState(
      sessionId,
      hostId,
      selectedNodeId
    );

    const user = {
      userId: hostId,
      username: (req.user && req.user.username) ? req.user.username : 'Host'
    };
    await sessionStateService.addParticipant(sessionId, user);

    if (session) {
      session.participants = [user];
    }

    res.status(201).json({
      success: true,
      sessionId: sessionId,
      assignedNode: selectedNodeId,
      nodeType: activeNodeIds.length > 0 ? 'worker' : 'manager-fallback', // Bilgi ver
      data: session
    });

  } catch (error) {
    console.error('Session Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// 2. POST /api/sessions/:id/join
exports.joinSession = async (req, res) => {
  try {
    const { id } = req.params;
    // Kullanıcı bilgisini token'dan al
    const user = {
      userId: req.user.userId || req.user.id,
      username: req.user.username || 'Anonymous'
    };

    const participants = await sessionStateService.addParticipant(id, user);

    res.status(200).json({
      success: true,
      message: 'Oturuma katılım başarılı.',
      sessionId: id,
      participants
    });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

// 3. POST /api/sessions/:id/heartbeat
exports.heartbeat = async (req, res) => {
  try {
    const { id } = req.params;
    await sessionStateService.updateHeartbeat(id);
    res.status(200).json({ success: true, message: 'Oturum süresi uzatıldı.' });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

exports.simulateMetrics = async (req, res) => {
  try {
    const { id } = req.params; // Session ID
    const { jitter, packetLoss } = req.body; // Sadece ham veri gelir

    if (typeof jitter === 'undefined' || typeof packetLoss === 'undefined') {
      return res.status(400).json({ success: false, message: 'jitter ve packetLoss gereklidir.' });
    }

    // 1. Puanı Hesapla (Mevcut mantığı kullanıyoruz, yeniden yazmıyoruz)
    const healthScore = metricsService.calculateHealthScore(Number(jitter), Number(packetLoss));

    // 2. Güncellenecek Veriyi Hazırla
    const simulatedMetrics = {
      jitter: Number(jitter),
      packetLoss: Number(packetLoss),
      healthScore: healthScore,
      isSimulated: true // UI'da bunun test verisi olduğunu anlamak için
    };

    // 3. Veritabanına Yaz (Controller işi yapmaz, servise yaptırır)
    await sessionStateService.updateSessionMetrics(id, simulatedMetrics);

    res.status(200).json({
      success: true,
      message: 'Simülasyon güncellendi.',
      data: simulatedMetrics
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- GÜNCELLENEN: DURUM SORGULAMA ---
exports.getSessionState = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Ham Veriyi Çek
    const state = await sessionStateService.getSessionState(id);

    if (!state) {
      return res.status(404).json({ success: false, error: 'Oturum bulunamadı.' });
    }

    // 2. QoS Kararını İste (Modüler Yapı)
    // Controller, elindeki metriği QoS servisine verir ve "Kararın nedir?" der.
    if (state.networkMetrics) {
      // Biz JSON uydurmuyoruz, servis ne dönerse onu ekliyoruz.
      state.qosDecision = qosService.decideQualityPolicy(state.networkMetrics);
    }

    res.status(200).json({ success: true, data: state });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 5. GET /api/sessions/active
exports.listActiveSessions = async (req, res) => {
  try {
    const sessions = await sessionStateService.getAllActiveSessions();
    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 6. POST /api/sessions/:id/leave
exports.leaveSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;

    await sessionStateService.removeParticipant(id, userId);

    res.status(200).json({ success: true, message: 'Oturumdan ayrıldınız.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};