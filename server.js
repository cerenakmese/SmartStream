const express = require('express');
const connectDB = require('./src/config/db');
const app = express();

connectDB();

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'ResilientStream API' });
});


// Konfigürasyon
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.HOSTNAME || 'localhost'; // Docker'da container ID'si olur

// Middleware
app.use(express.json());

// 1. Basit Endpoint (Health Check)
app.get('/', (req, res) => {
    res.json({
        message: 'ResilientStream API çalışıyor!',
        node: NODE_ID,
        status: 'Healthy'
    });
});

// 2. Simülasyon Endpoint'i (İleride burası dolacak)
app.post('/api/sessions/init', (req, res) => {
    res.json({
        sessionId: 'session-' + Math.floor(Math.random() * 10000),
        hostedBy: NODE_ID
    });
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`[${NODE_ID}] Sunucu ${PORT} portunda çalışıyor...`);
});