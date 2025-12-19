const express = require('express');
const http = require('http'); //
const dotenv = require('dotenv');
const cors = require('cors');




const { initSocket } = require('./src/services/socketService');
// --- Bağlantı Dosyaları ---
const connectDB = require('./src/config/db');
require('./src/config/redis');

const nodeManager = require('./src/services/nodeManager');
const failoverService = require('./src/services/failoverService');

// --- Rota Dosyaları ---
const authRoutes = require('./src/routes/authRoutes');
const sessionRoutes = require('./src/routes/sessions');

const { redisClient } = require('./src/config/redis');

// Ortam Değişkenlerini Yükle
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.HOSTNAME || 'localhost';
const server = http.createServer(app);


// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));


// --- Veritabanı Başlatma ---
connectDB();

nodeManager.startHeartbeat();
// 2. Bu sunucu diğer ölü sunucuları izlemeye başlasın (Failover Watchdog)
failoverService.startMonitoring();

// --- Rotalar (Routes) ---
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);

app.post('/api/admin/kill', async (req, res) => {
    await nodeManager.simulateCrash(); // Kalp atışını durdur
    res.json({
        message: `🚨 Node (${NODE_ID}) çökmüş taklidi yapıyor!`,
        status: 'CRASHED',
        node: NODE_ID
    });
});

// 2. Sunucuyu Dirilt
app.post('/api/admin/revive', async (req, res) => {
    await nodeManager.startHeartbeat(); // Kalp atışını yeniden başlat
    res.json({
        message: `♻️ Node (${NODE_ID}) tekrar hayata döndü!`,
        status: 'ACTIVE',
        node: NODE_ID
    });
});

// 3. Aktif Node Listesini Getir (Dashboard için)
app.get('/api/admin/nodes', async (req, res) => {
    try {
        const nodes = await redisClient.smembers('active_nodes');
        res.json({
            activeNodes: nodes,
            currentNode: NODE_ID
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Sağlık Kontrolleri (Health Checks) ---
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'ResilientStream API',
        node: NODE_ID
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'ResilientStream API çalışıyor 🚀',
        node: NODE_ID,
        status: 'Healthy'
    });
});


initSocket(server);

//sunucuyu baslat
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[${NODE_ID}] Sunucu ${PORT} portunda çalışıyor.`);
    console.log(`[${NODE_ID}] 🔌 Socket.io Ağ Geçidi Hazır!`);
});