const sessionStateService = require('../services/sessionState');
const { redisClient } = require('../config/redis');

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

// 4. GET /api/sessions/:id/state
exports.getSessionState = async (req, res) => {
  try {
    const { id } = req.params;
    const state = await sessionStateService.getSessionState(id);

    if (!state) {
      return res.status(404).json({ success: false, error: 'Oturum bulunamadı.' });
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