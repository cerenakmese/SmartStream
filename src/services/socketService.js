const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { redisClient } = require('../config/redis');
const metricsService = require('./metricsService');
const qosService = require('./qosService');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const pubClient = redisClient.duplicate({ lazyConnect: true });
  const subClient = redisClient.duplicate({ lazyConnect: true });

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ [Socket] Redis Adapter bağlandı');
    })
    .catch((err) => console.error('❌ [Socket] Hata:', err));

  io.on('connection', (socket) => {
    // console.log(`🔌 Yeni Bağlantı: ${socket.id}`);

    // --- NETWORK HEALTH MONITOR ---
    socket.on('net-ping', async (data) => {
      // 1. Jitter Hesapla
      const seqNum = data.seqNum || 0;
      
      const metrics = await metricsService.calculateMetrics(socket.id, data.timestamp, seqNum);
      
      // 2. Karar Ver (QoS Engine)
      const qosDecision = qosService.decideQualityPolicy(metrics);
      
      if (qosDecision.status === 'CRITICAL') {
          // console.log(`🔥 [QoS] ${socket.id} için aksiyon: ${qosDecision.action}`);
      }

      // 3. Sonuçları İstemciye Geri Gönder (Pong)
      socket.emit('net-pong', { 
        clientTime: data.timestamp, 
        serverTime: Date.now(),
        networkStats: {
            jitter: metrics.jitter,
            packetLoss: metrics.packetLoss, // Sonraki adımda yapacağız
            healthScore: metrics.healthScore 
        },
        qosPolicy: qosDecision
      });
    });

    socket.on('disconnect', () => {
      // Çıkan kullanıcının metric verilerini sil
      metricsService.removeClient(socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io başlatılmadı!');
  return io;
};

module.exports = { initSocket, getIO };