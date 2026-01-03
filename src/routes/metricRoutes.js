const express = require('express');
const router = express.Router();
const metricsService = require('../services/metricsService'); // Senin servisin
const mongoose = require('mongoose'); // Yeni: DB kontrolü için
const { redisClient } = require('../config/redis'); // Yeni: Redis kontrolü için

// ----------------------------------------------------
// 1. Log Kaydet ve Hesapla (MEVCUT KODUN)
// @route   POST /api/metrics/log
// ----------------------------------------------------
router.post('/log', async (req, res) => {
    try {
        // Postman'den gelecek veriler:
        const { socketId, clientTimestamp, seqNum, sessionId } = req.body;

        // Senin yazdığın hesaplama fonksiyonunu çağırıyoruz
        const result = await metricsService.calculateMetrics(
            socketId || 'test-socket', 
            clientTimestamp || Date.now(), 
            seqNum || 1, 
            sessionId || 'session-1'
        );
        
        console.log(`[METRIC] Score: ${result.healthScore}`);
        
        res.status(200).json({ 
            success: true, 
            data: result 
        });
    } catch (error) {
        console.error('Metric Log Hatası:', error);
        res.status(500).json({ success: false, message: 'Metrics Error' });
    }
});

// ----------------------------------------------------
// 2. SYSTEM HEALTH ROUTE'U (YENİ EKLENEN)
// @route   GET /api/metrics/system-health
// ----------------------------------------------------
router.get('/system-health', async (req, res) => {
    try {
        // A) Uptime (Sunucu ne kadar süredir açık)
        const uptime = process.uptime();
        
        // B) Memory Usage (RAM kullanımı)
        const memory = process.memoryUsage();
        
        // C) DB Durumları (Canlı kontrol)
        // Mongoose: 1 = connected
        const mongoStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
        // Redis: isOpen (v4+ için)
        const redisStatus = redisClient.isOpen ? 'Connected' : 'Disconnected';

        res.status(200).json({
            success: true,
            system: 'Smart Stream Relay API',
            status: 'Operational ',
            timestamp: new Date(),
            infrastructure: {
                uptime: `${Math.floor(uptime)} seconds`,
                memory_heap: `${Math.floor(memory.heapUsed / 1024 / 1024)} MB`,
                database: mongoStatus,
                cache: redisStatus
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;