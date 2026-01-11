const express = require('express');
const router = express.Router();
const http = require('http');
const mongoose = require('mongoose');
const { redisClient } = require('../config/redis');
const auth = require('../middleware/auth');
const os = require('os');
const analyticsService = require('../services/analyticsService');
const admin = require('../middleware/admin');

const CONTAINER_MAP = {
    'node-primary': 'smartstream-api-1',
    'node-backup': 'smartstream-api-2',
    'node-backup-2': 'smartstream-api-3',
    'smartstream-api-1': 'smartstream-api-1',
    'smartstream-api-2': 'smartstream-api-2',
    'smartstream-api-3': 'smartstream-api-3'
};

function sendDockerCommand(action, containerName) {
    return new Promise((resolve, reject) => {
        const options = {
            socketPath: '/var/run/docker.sock',
            path: `/containers/${containerName}/${action}`, // action: 'start' veya 'stop'
            method: 'POST'
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === 204 || res.statusCode === 304) {
                resolve(true);
            } else {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => reject(new Error(`Docker Error ${res.statusCode}: ${body}`)));
            }
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}


router.post('/kill/:nodeId', auth, admin, async (req, res) => {
    try {
        const targetNodeId = req.params.nodeId;
        const containerName = CONTAINER_MAP[targetNodeId];

        if (!containerName) {
            return res.status(400).json({ message: 'Geçersiz Node ID' });
        }

        // Kendini öldürmeye çalışıyorsa uyar (Opsiyonel)
        if (process.env.HOSTNAME === containerName) {
            return res.status(400).json({ message: 'Admin paneli kendini kapatamaz. Başka node üzerinden deneyin.' });
        }

        console.log(`[Admin] ${targetNodeId} (${containerName}) için durdurma emri veriliyor...`);

        // Docker'a "STOP" komutu yolla
        await sendDockerCommand('stop', containerName);

        res.json({
            success: true,
            message: `${targetNodeId} fiziksel olarak durduruldu. (Status: Exited)`,
            target: targetNodeId,
            action: 'KILL_PHYSICAL'
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/revive/:nodeId', auth, admin, async (req, res) => {
    try {
        const targetNodeId = req.params.nodeId;
        const containerName = CONTAINER_MAP[targetNodeId];

        if (!containerName) return res.status(404).json({ error: 'Bilinmeyen Node ID' });

        console.log(`[Admin] ${targetNodeId} canlandırılıyor...`);

        // Docker'a "START" komutu yolla
        await sendDockerCommand('start', containerName);

        res.json({
            success: true,
            message: ` ${targetNodeId} (${containerName}) fiziksel olarak başlatıldı!`,
            action: 'DOCKER_START'
        });
    } catch (e) {
        console.error(e);
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