const express = require('express');
const router = express.Router();
const metricsService = require('../services/metricsService');
const mongoose = require('mongoose');
const { redisClient } = require('../config/redis');
const auth = require('../middleware/auth');
const os = require('os');
const analyticsService = require('../services/analyticsService');
const admin = require('../middleware/admin');



router.post('/kill/:nodeId', auth, admin, async (req, res) => {
    try {
        // URL'den ID'yi alıyoruz (örn: smartstream-api-1)
        const targetNodeId = req.params.nodeId;

        if (!targetNodeId) {
            return res.status(400).json({ message: 'Node ID gereklidir.' });
        }

        const currentNode = process.env.NODE_ID;
        if (targetNodeId === currentNode) {
            return res.status(400).json({
                success: false,
                message: 'Kendini öldüremezsin! Lütfen worker nodunu hedef al.'
            });
        }

        // Redis'e bu ID için "Zehir" bırakıyoruz
        await redisClient.set(`poison:${targetNodeId}`, 'true');

        console.log(`[Admin]  ${targetNodeId} öldürüldü.`);

        res.json({
            success: true,
            message: ` ${targetNodeId} hedeflendi ve durduruluyor.`,
            target: targetNodeId,
            action: 'POISON_PILL_SET'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Belirli Bir Node'u Dirilt (ANTIDOTE)
// Kullanım: POST /api/admin/revive/smartstream-api-1
router.post('/revive/:nodeId', auth, admin, async (req, res) => {
    try {
        const targetNodeId = req.params.nodeId;

        // Redis'teki zehri siliyoruz
        await redisClient.del(`poison:${targetNodeId}`);

        console.log(`[Admin]  ${targetNodeId} çalıştı.`);

        res.json({
            success: true,
            message: `${targetNodeId} tekrar sisteme dönebilir.`,
            target: targetNodeId,
            action: 'POISON_PILL_REMOVED'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



router.get('/system-health', auth, admin, async (req, res) => {
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

router.get('/call-logs', auth, admin, async (req, res) => {
    try {
        const { sessionId, event, limit } = req.query;

        // Filtre Hazırla
        const filter = {};
        if (sessionId) filter.sessionId = sessionId;
        if (event) filter.event = event;

        // Servisten Çek
        const logs = await analyticsService.getLogs(filter, parseInt(limit) || 20);

        res.status(200).json({
            success: true,
            count: logs.length,
            data: logs
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



module.exports = router;