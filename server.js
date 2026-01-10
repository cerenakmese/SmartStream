require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const cors = require('cors');
const path = require('path');



const connectDB = require('./src/config/db');
const { redisClient } = require('./src/config/redis');

// --- Servisler ---
const socketService = require('./src/services/socketService');
const nodeManager = require('./src/services/nodeManager');
const failoverService = require('./src/services/failoverService');


// --- Rota Dosyaları ---
const authRoutes = require('./src/routes/authRoutes');      // Auth
const sessionRoutes = require('./src/routes/sessions');     // Session
const userRoutes = require('./src/routes/userRoutes');      // User
const nodeRoutes = require('./src/routes/nodeRoutes');      // Node
const adminRoutes = require('./src/routes/adminRoutes');


const app = express();
const httpServer = http.createServer(app);

// Sunucu Kimliği
const NODE_ID = process.env.HOSTNAME || `node-${Math.floor(Math.random() * 1000)}`;


connectDB();

// 3. Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));



app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/admin', adminRoutes);




app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. Socket.io Kurulumu
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Redis Adapter
const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`[${NODE_ID}] Redis Adapter Bağlandı.`);
    socketService(io);
}).catch(err => {
    console.log(` Redis Adapter uyarısı: ${err.message}`);
    io.adapter(createAdapter(pubClient, subClient));
    socketService(io);
});

// 6. Sunucuyu Başlat (TEK BİR TANE OLMALI)
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n [${NODE_ID}] Sunucu ${PORT} portunda yayında!`);
    console.log(` DB Durumu: Bağlanıyor...`);

    //4: Discovery yerine NodeManager Heartbeat başladı
    await nodeManager.startHeartbeat();
    if (failoverService && typeof failoverService.startMonitoring === 'function') {
        failoverService.startMonitoring();
    }
});

// 7. Graceful Shutdown
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

async function shutDown() {
    console.log(`\n [${NODE_ID}] Kapanıyor...`);

    // DEĞİŞİKLİK 5: Kapanırken Heartbeat durduruluyor
    await nodeManager.stopHeartbeat();

    // Bağlantıları kapat
    if (redisClient.isOpen) await redisClient.quit();
    if (pubClient.isOpen) await pubClient.quit();
    if (subClient.isOpen) await subClient.quit();

    process.exit(0);
}

