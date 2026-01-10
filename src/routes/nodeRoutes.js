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

// @desc    Node Sağlık Kontrolü
router.get('/:id/health', auth, (req, res) => {
    res.status(200).json({
        nodeId: req.params.id,
        status: 'Healthy ',
        uptime: process.uptime()
    });
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
            type: type || 'relay',
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