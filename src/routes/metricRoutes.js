const express = require('express');
const router = express.Router();
const metricsService = require('../services/metricsService');
const mongoose = require('mongoose');
const { redisClient } = require('../config/redis');
const auth = require('../middleware/auth');
const os = require('os');


router.post('/log', auth, async (req, res) => {
    try {
        const { socketId, clientTimestamp, seqNum, sessionId } = req.body;

        // 1. Validasyon (Burası kritik, veri yoksa işlem yapma!)
        if (!socketId || !sessionId || !seqNum) {
            return res.status(400).json({
                success: false,
                message: 'Eksik veri: socketId, sessionId ve seqNum zorunludur.'
            });
        }

        // 2. İşlemi Başlat (Await kullanmaya devam edebilirsin ama cevap süresini izle)
        const result = await metricsService.calculateMetrics(
            socketId,
            clientTimestamp || Date.now(), // Timestamp yoksa sunucu zamanını kullanmak mantıklıdır
            seqNum,
            sessionId
        );

        // 3. İstemciye sadece Score dönmek yeterli (Tüm datayı dönüp ağı yorma)
        res.status(200).json({
            success: true,
            score: result.healthScore
        });

    } catch (error) {
        console.error('Metric Log Hatası:', error);
        // İstemciye hatanın detayını gösterme (Güvenlik)
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

router.get('/system-health', auth, async (req, res) => {
    try {
        // 1. Kaynak Tüketimi (OS ve Process)
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const loadAverage = os.loadavg(); // Sunucu yükü (1, 5, 15 dk)

        // 2. Bağımlılık Kontrolleri (Gerçek Durum)
        const isMongoConnected = mongoose.connection.readyState === 1;
        const isRedisConnected = redisClient.status === 'ready' || redisClient.isOpen;

        // 3. Genel Sağlık Kararı
        // Eğer veritabanlarından biri bile yoksa sistem "Sağlıksızdır"
        const isSystemHealthy = isMongoConnected && isRedisConnected;

        // Sağlıklı değilse 503 (Hizmet Veremiyor), sağlıklıysa 200 (Tamam) dön
        const httpStatus = isSystemHealthy ? 200 : 503;
        const systemStatus = isSystemHealthy ? 'Operational' : 'Degraded / Unhealthy';

        res.status(httpStatus).json({
            success: isSystemHealthy,
            system: 'Smart Stream Relay API',
            status: systemStatus, // Artık dinamik!
            timestamp: new Date().toISOString(),
            checks: {
                mongodb: {
                    status: isMongoConnected ? 'UP' : 'DOWN',
                    host: mongoose.connection.host
                },
                redis: {
                    status: isRedisConnected ? 'UP' : 'DOWN'
                }
            },
            metrics: {
                uptime: `${Math.floor(uptime)}s`,
                process_memory: `${Math.floor(memoryUsage.heapUsed / 1024 / 1024)} MB`,
                system_load: loadAverage, // [1dk, 5dk, 15dk] ortalaması
                free_system_memory: `${Math.floor(os.freemem() / 1024 / 1024)} MB`
            }
        });

    } catch (error) {
        console.error('Health Check Error:', error);
        res.status(500).json({
            success: false,
            status: 'Critical Failure',
            error: error.message
        });
    }
});

module.exports = router;