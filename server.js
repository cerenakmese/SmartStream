require('dotenv').config(); // 1. Ortam değişkenlerini en başta yükle

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const cors = require('cors'); // İstemci engellerini kaldırmak için

// --- Konfigürasyon ve Veritabanı ---
const connectDB = require('./src/config/db');
const { redisClient } = require('./src/config/redis');

// --- Servisler ---
const socketService = require('./src/services/socketService');
const discoveryService = require('./src/services/discoveryService');

// --- Rota Dosyaları ---
const authRoutes = require('./src/routes/authRoutes');      // Auth (Giriş/Kayıt)
const sessionRoutes = require('./src/routes/sessions'); // Oturum Yönetimi

// --- Uygulama Başlatma ---
const app = express();
const httpServer = http.createServer(app);

// Sunucu Kimliği (Loglar için)
const NODE_ID = process.env.HOSTNAME || `node-${Math.floor(Math.random() * 1000)}`;

// 2. Veritabanına Bağlan (Server başlamadan önce)
connectDB();

// 3. Middleware (Ara Katmanlar)
app.use(cors());          // Tüm isteklere izin ver (Geliştirme aşaması için)
app.use(express.json());  // Gelen JSON verilerini oku (req.body için şart!)

// 4. Rotaları Tanımla
app.use('/api/auth', authRoutes);       // Örn: POST /api/auth/login
app.use('/api/sessions', sessionRoutes); // Örn: POST /api/sessions/create

// Basit Sağlık Kontrolü (Health Check)
app.get('/', (req, res) => {
    res.send(`SmartStream API Çalışıyor! 🚀 Node: ${NODE_ID}`);
});

// 5. Socket.io Kurulumu (Redis Adapter ile)
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Frontend'den gelen her şeye izin ver
        methods: ["GET", "POST"]
    }
});

// Redis Adapter: Socket.io'nun çoklu sunucuda konuşabilmesi için
// Mevcut redisClient'ı kopyalayıp Pub/Sub için kullanıyoruz
const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    // Adapteri bağla
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`✅ [${NODE_ID}] Redis Adapter Bağlandı.`);
    
    // Socket Servisini Başlat (Olayları Dinle)
    socketService(io); 
}).catch(err => {
    // ioredis bazen otomatik bağlanır, hata verirse buraya düşer ama çalışmaya devam edebilir
    console.log(`⚠️ Redis Adapter uyarısı (Önemli olmayabilir): ${err.message}`);
    // Hata olsa bile socket servisini başlatmayı dene
    io.adapter(createAdapter(pubClient, subClient));
    socketService(io);
});

// 6. Sunucuyu Dinlemeye Başla
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 [${NODE_ID}] Sunucu ${PORT} portunda yayında!`);
    console.log(`🔗 DB Durumu: Bağlanıyor...`);

    // Node Registry: "Ben buradayım" sinyali gönder
    await discoveryService.registerNode();
});

// 7. Graceful Shutdown (Güvenli Kapanış)
// Uygulama kapatılırsa (CTRL+C veya Docker stop), kaydı sil
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

async function shutDown() {
    console.log(`\n👋 [${NODE_ID}] Kapanıyor...`);
    
    // Node Registry'den kaydı sil
    await discoveryService.unregisterNode();
    
    // Bağlantıları kapat
    await redisClient.quit();
    await pubClient.quit();
    await subClient.quit();
    
    process.exit(0);
}