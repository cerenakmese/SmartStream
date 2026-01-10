const jwt = require('jsonwebtoken');
const metricsService = require('./metricsService');
const qosService = require('./qosService');
const sessionStateService = require('./sessionState');
const nodeManager = require('./nodeManager');

module.exports = (io) => {

  // --- 1. GÜVENLİK DUVARI (MIDDLEWARE) ---
  io.use((socket, next) => {
    // 1. Token'ı Handshake (Tokalaşma) verisinden alma
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    // Test veya geliştirme ortamı için esneklik (Opsiyonel)
    // Eğer token yoksa veya "BURAYA_GIRIS_TOKENI" ise test kullanıcısı ata
    if (!token || token.includes('BURAYA_GIRIS_TOKENI')) {
      console.log(`⚠️ [Socket] Test Modu: Token doğrulaması atlandı. (${socket.id})`);
      socket.user = { userId: 'admin-test', username: 'Admin (Test)' };
      return next();
    }

    // 2. Token'ı Doğrula
    const secret = process.env.JWT_SECRET || 'gizli_anahtar';

    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        console.log(`[Socket] Geçersiz Token! Bağlantı Reddedildi: ${socket.id}`);
        return next(new Error('Authentication error: Geçersiz Token!'));
      }

      // 3. Başarılıysa kullanıcı bilgisini socket'e yapıştır
      socket.user = decoded;
      socket.user.userId = decoded.id || decoded.userId; // Farklı token yapılarına uyum
      // console.log(` [Socket] Yetkili Giriş: ${socket.user.userId}`);
      next(); // Kapıyı aç
    });
  });

  // --- 2. BAĞLANTI KABUL EDİLDİ ---
  io.on('connection', (socket) => {

    if (nodeManager && !nodeManager.isActive) {
      console.log(`💀 [Socket] Node ölü, bağlantı reddediliyor: ${socket.id}`);
      socket.disconnect(true);
      return; // Alt satırlara (recover-session vb.) inmesin
    }
    console.log(`🔌 [Socket] Bağlandı: ${socket.id}`);

    // --- SESSION RECOVERY ---
    socket.on('recover-session', async () => {
      try {
        const recoveredSessionId = await sessionStateService.recoverUserSession(socket.user.userId);

        if (recoveredSessionId) {
          console.log(`♻️ [Socket] Kullanıcı ${socket.user.username || 'Anonim'} eski oturumuna geri döndü: ${recoveredSessionId}`);
          socket.join(recoveredSessionId);
          socket.emit('session-joined', {
            success: true,
            sessionId: recoveredSessionId,
            recovered: true
          });
        }
      } catch (e) {
        console.error('Recovery Error:', e);
      }
    });

    // --- JOIN SESSION ---
    socket.on('join-session', async (sessionId) => {
      try {
        // console.log(` [Socket] Katılım İsteği: ${socket.user.userId} -> ${sessionId}`);

        // A) Redis'e Kaydet
        const activeParticipants = await sessionStateService.addParticipant(sessionId, socket.user);

        // B) Socket'i Odaya Al
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

        console.log(`[Socket] Kullanıcı Odaya Girdi: ${sessionId}`);

      } catch (error) {
        console.error(` [Socket] Join Hatası:`, error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // --- NETWORK HEALTH MONITOR (Güncellenmiş Hali) ---
    socket.on('net-ping', async (data) => {

      if (!nodeManager.isActive) {
        console.log(`💀 [Socket] Node ölü olduğu için bağlantı reddediliyor: ${socket.id}`);
        socket.disconnect(true); // İstemciyi zorla at
        return; // İşlemi durdur
      }

      try {
        const seqNum = data.seqNum || 0;
        // Frontend'den gelen sessionId'yi al, yoksa null
        const currentSessionId = data.sessionId || null;
        const simulatedMetrics = data.simulated || { packetLoss: 0, jitter: 0 };

        // Metrikleri Hesapla
        const metrics = await metricsService.calculateMetrics(
          socket.id,
          data.timestamp || Date.now(), // clientTimestamp
          seqNum,
          currentSessionId,
          simulatedMetrics
        );

        // QoS Kararını Al
        // Eğer qosService yoksa basit bir obje döndür (Fallback)
        let qosDecision = { status: 'OPTIMAL', action: 'NONE' };
        if (qosService && typeof qosService.decideQualityPolicy === 'function') {
          qosDecision = qosService.decideQualityPolicy(metrics);
        }

        // Pong Cevabı
        socket.emit('net-pong', {
          clientTime: data.timestamp,
          serverTime: Date.now(),
          networkStats: {
            jitter: metrics.jitter || 0,
            packetLoss: metrics.packetLoss || 0,
            healthScore: metrics.healthScore ?? 100
          },
          qosPolicy: qosDecision
        });

      } catch (error) {
        console.error(`[Socket] Ping Hatası (${socket.id}):`, error.message);
        socket.emit('net-pong', {
          clientTime: data.timestamp,
          serverTime: Date.now(),
          networkStats: {
            jitter: 0,
            packetLoss: 0,
            healthScore: 0 // Hata olduğunu belli etmek için 0 veya düşük skor
          },
          qosPolicy: { status: 'ERROR', action: 'MAINTAIN', reason: 'Internal Server Error' }
        });
      }
    });



    socket.on('disconnect', () => {
      if (metricsService && typeof metricsService.removeClient === 'function') {
        metricsService.removeClient(socket.id);
      }
      console.log(`❌ [Socket] Ayrıldı: ${socket.id}`);
    });
  });
};