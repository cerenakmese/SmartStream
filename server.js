const express = require('express');
const { createClient } = require('redis');
const app = express();

// Konfigürasyon
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.HOSTNAME || 'localhost';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

// Redis İstemcisi Oluştur
const client = createClient({
    url: REDIS_URL
});

client.on('error', (err) => console.log('Redis Client Error', err));

// Redis'e Bağlan (IIFE - Immediately Invoked Function Expression)
(async () => {
    await client.connect();
    console.log(`[${NODE_ID}] Redis'e başarıyla bağlandı!`);
})();

app.use(express.json());

// 1. Ziyaretçi Sayacı Endpoint'i
app.get('/', async (req, res) => {
    try {
        // Redis'teki 'visits' anahtarını 1 artır
        const visits = await client.incr('visits');

        res.json({
            message: 'ResilientStream API çalışıyor!',
            node: NODE_ID,
            total_visits: visits, // Bu sayı Redis'ten geliyor!
            status: 'Connected to Redis'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Simülasyon Endpoint'i
app.post('/api/sessions/init', (req, res) => {
    res.json({
        sessionId: 'session-' + Math.floor(Math.random() * 10000),
        hostedBy: NODE_ID
    });
});

app.listen(PORT, () => {
    console.log(`[${NODE_ID}] Sunucu ${PORT} portunda çalışıyor...`);
});