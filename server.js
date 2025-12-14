const express = require('express');
const { connectRedis } = require('./config/redis');
const sessionRoutes = require('./routes/sessions');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.HOSTNAME || 'localhost';

// Middleware (JSON verisini okumak için şart)
app.use(express.json());

// Veritabanı Bağlantısını Başlat
connectRedis();

// Rotaları Tanımla
app.use('/api/sessions', sessionRoutes);

// Health Check (Basit Kontrol)
app.get('/', (req, res) => {
    res.json({
        message: 'ResilientStream API çalışıyor 🚀',
        node: NODE_ID,
        status: 'Healthy'
    });
});

app.listen(PORT, () => {
    console.log(`[${NODE_ID}] Sunucu ${PORT} portunda hazır.`);
});