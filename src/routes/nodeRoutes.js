const express = require('express');
const router = express.Router();
const { redisClient } = require('../config/redis');
const auth = require('../middleware/auth');


router.get('/available', auth, async (req, res) => {
    try {
        const nodeIds = await redisClient.smembers('active_nodes');
        const nodes = [];

        // Şimdiki zamanı al
        const NOW = Date.now();
        // Tolerans süresi (Örn: 30 saniye). Node 30 sn boyunca heartbeat atmazsa ölü sayılır.
        const TIMEOUT_MS = 30 * 1000;

        for (const id of nodeIds) {
            const info = await redisClient.hgetall(`node:${id}`);

            // KONTROL 1: Veri hiç yoksa (Redis'ten silinmişse)
            if (!info || Object.keys(info).length === 0) {
                await redisClient.srem('active_nodes', id);
                console.log(`Verisi olmayan node temizlendi: ${id}`);
                continue; // Döngüyü pas geç
            }

            // KONTROL 2: Veri var ama ÇOK ESKİ mi? (Zombi Kontrolü)
            // lastSeen verisini sayıya çeviriyoruz
            const lastSeen = Number(info.lastSeen);

            if (NOW - lastSeen > TIMEOUT_MS) {
                // Node çok uzun süredir sessiz, ölü kabul et ve sil
                await redisClient.srem('active_nodes', id);
                await redisClient.del(`node:${id}`); // Hash verisini de temizle
                console.log(`Zombi node (Süresi Dolmuş) temizlendi: ${id}`);
            } else {
                // Node hem var hem de taze, listeye ekle
                nodes.push(info);
            }
        }

        res.status(200).json({
            success: true,
            count: nodes.length,
            data: nodes
        });
    } catch (error) {
        console.error('Node List Hatası:', error);
        res.status(500).json({ message: 'Node listesi alınamadı' });
    }
});

router.get('/:id/health', auth, async (req, res) => {
    try {
        const targetNodeId = req.params.id;
        const NOW = Date.now();
        const TIMEOUT_MS = 30 * 1000;

        // 1. Önce Veriyi Çek (Redis'te ne var ne yok görelim)
        const nodeData = await redisClient.hgetall(`node:${targetNodeId}`);


        // Eğer Node verisi hiç yoksa (Offline/Silinmiş)
        if (!nodeData || Object.keys(nodeData).length === 0) {
            return res.status(404).json({
                success: false,
                nodeId: targetNodeId,
                message: 'Sunucu verisi bulunamadı.'
            });
        }

        // Redis'teki gerçek statüyü alıyoruz (Muhtemelen 'active')
        const redisStatus = nodeData.status || 'unknown';
        const lastSeen = nodeData.lastSeen ? Number(nodeData.lastSeen) : 0;



        // --- SENARYO a: ZOMBIE (TIMEOUT) ---
        if (NOW - lastSeen > TIMEOUT_MS) {
            return res.status(503).json({
                success: false,
                nodeId: targetNodeId,
                status: redisStatus, // "active" yazıyorsa "active" döner
                message: `Sunucudan ${Math.floor((NOW - lastSeen) / 1000)} saniyedir haber alınamıyor.`
            });
        }

        // --- SENARYO b: SAĞLIKLI ---
        res.status(200).json({
            success: true,
            nodeId: targetNodeId,
            status: redisStatus, // Redis ile birebir aynı
            lastSeen: new Date(lastSeen).toISOString(),
            load: nodeData.load || 0
        });

    } catch (error) {
        console.error('Health Check Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// @desc    Chaos Monkey: Node'u öldür
router.post('/register', auth, async (req, res) => {
    try {
        const { ip, port, type } = req.body;

        // Basit validasyon
        if (!ip || !port) {
            return res.status(400).json({ message: 'IP ve Port gerekli!' });
        }

        // NodeManager servisini kullanarak kaydet (Simülasyon)
        const nodeId = `node-${Math.floor(Math.random() * 1000)}`;
        const nodeInfo = {
            id: nodeId,
            ip,
            port,
            type: type || 'worker',
            status: 'active',
            lastSeen: Date.now(),
            load: 0
        };

        // Redis'e manuel yaz
        await redisClient.hset(`node:${nodeId}`, nodeInfo);
        await redisClient.sadd('active_nodes', nodeId);

        res.status(201).json({
            success: true,
            message: 'Node manuel olarak kaydedildi.',
            nodeId: nodeId
        });

    } catch (error) {
        console.error('Register Hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;