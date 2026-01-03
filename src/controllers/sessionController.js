const sessionStateService = require('../services/sessionState');

// 1. POST /api/sessions/init
exports.createSession = async (req, res) => {
  try {
    const { config } = req.body;
    // Host ID'yi token'dan alıyoruz (Auth middleware sayesinde)
    const hostId = req.user.userId || req.user.id;
    const nodeId = process.env.HOSTNAME || 'node-primary';

    // Rastgele Session ID üret (veya client'tan geleni kullan)
    const sessionId = req.body.sessionId || `room-${Date.now()}`;

    const session = await sessionStateService.createSessionState(
        sessionId, 
        hostId, 
        nodeId
    );

    res.status(201).json({
        success: true,
        message: 'Oturum başarıyla başlatıldı.',
        sessionId: sessionId,
        data: session
    });
  } catch (error) {
    console.error('Create Session Error:', error);
    res.status(400).json({ success: false, error: error.message });
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