const jwt = require('jsonwebtoken'); // 👈 EKLENDİ
const metricsService = require('./metricsService');
const qosService = require('./qosService');
const sessionStateService = require('./sessionState');


module.exports = (io) => {

  // 🛡️ GÜVENLİK DUVARI (MIDDLEWARE)
  // Bağlantı kurulmadan ÖNCE burası çalışır
  io.use((socket, next) => {
    // 1. Token'ı Handshake (Tokalaşma) verisinden al
    // Postman veya Client, token'ı 'auth' objesi içinde göndermeli
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      console.log(`⛔ [Socket] Token Yok! Bağlantı Reddedildi: ${socket.id}`);
      return next(new Error('Authentication error: Token gerekli!'));
    }

    // 2. Token'ı Doğrula
    const secret = process.env.JWT_SECRET || 'gizli_anahtar';
    
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        console.log(`⛔ [Socket] Geçersiz Token! Bağlantı Reddedildi: ${socket.id}`);
        return next(new Error('Authentication error: Geçersiz Token!'));
      }

      // 3. Başarılıysa kullanıcı bilgisini socket'e yapıştır
      // Artık socket.user.userId diyerek bu kim öğrenebiliriz
      socket.user = decoded;
      // console.log(`✅ [Socket] Yetkili Giriş: ${decoded.userId}`);
      next(); // Kapıyı aç
    });
  });

  // --- BAĞLANTI KABUL EDİLDİ ---
  io.on('connection', (socket) => {
    // console.log(`🔌 Yeni Bağlantı (Auth): ${socket.id} - User: ${socket.user.userId}`);
    socket.on('join-session', async (sessionId) => {
        try {
            console.log(`📥 [Socket] Katılım İsteği: ${socket.user.userId} -> ${sessionId}`);

            // A) Redis'e Kaydet
            const activeParticipants = await sessionStateService.addParticipant(sessionId, socket.user);

            // B) Socket'i Odaya Al (Burası Socket.io'nun sihri)
            socket.join(sessionId);

            // C) Kullanıcıya "Başardın" de
            socket.emit('session-joined', { 
                success: true, 
                sessionId: sessionId,
                participants: activeParticipants
            });

            // D) Odadaki DİĞER herkese haber ver
            socket.to(sessionId).emit('user-joined', {
                userId: socket.user.userId,
                username: socket.user.username
            });

            console.log(`✅ [Socket] Kullanıcı Odaya Girdi: ${sessionId}`);

        } catch (error) {
            console.error(`❌ [Socket] Join Hatası:`, error.message);
            socket.emit('error', { message: error.message });
        }
    });
    // --- NETWORK HEALTH MONITOR ---
    socket.on('net-ping', async (data) => {
      try {
        const seqNum = data.seqNum || 0;
        const currentSessionId = data.sessionId || null;
        
        const metrics = await metricsService.calculateMetrics(
            socket.id, 
            data.timestamp, 
            seqNum, 
            currentSessionId
        );
        
        const qosDecision = qosService.decideQualityPolicy(metrics);
        
        socket.emit('net-pong', { 
          clientTime: data.timestamp, 
          serverTime: Date.now(),
          networkStats: {
              jitter: metrics.jitter,
              packetLoss: metrics.packetLoss,
              healthScore: metrics.healthScore 
          },
          qosPolicy: qosDecision
        });

      } catch (error) {
        console.error(`❌ [Socket] Ping Hatası (${socket.id}):`, error);
      }
    });

    socket.on('disconnect', () => {
      metricsService.removeClient(socket.id);
    });
  });
};