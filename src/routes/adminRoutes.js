const express = require('express');
const router = express.Router();
const { redisClient } = require('../config/redis');
const auth = require('../middleware/auth');
//const admin = require('../middleware/admin');

const NODE_ID = process.env.HOSTNAME || 'localhost';


// 1. Sistem Durumunu Getir
router.get('/nodes', auth, async (req, res) => {
    try {
        const nodes = await redisClient.smembers('active_nodes');
        res.json({
            activeNodes: nodes,
            currentNode: NODE_ID
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


router.post('/kill/:nodeId', auth, async (req, res) => {
    try {
        // URL'den ID'yi alıyoruz (örn: smartstream-api-1)
        const targetNodeId = req.params.nodeId;

        if (!targetNodeId) {
            return res.status(400).json({ message: 'Node ID gereklidir.' });
        }

        // Redis'e bu ID için "Zehir" bırakıyoruz
        await redisClient.set(`poison:${targetNodeId}`, 'true');

        console.log(`[Admin] 🔫 ${targetNodeId} için öldürüldü.`);

        res.json({
            success: true,
            message: `🚨 ${targetNodeId} hedeflendi ve durduruluyor.`,
            target: targetNodeId,
            action: 'POISON_PILL_SET'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Belirli Bir Node'u Dirilt (ANTIDOTE)
// Kullanım: POST /api/admin/revive/smartstream-api-1
router.post('/revive/:nodeId', auth, async (req, res) => {
    try {
        const targetNodeId = req.params.nodeId;

        // Redis'teki zehri siliyoruz
        await redisClient.del(`poison:${targetNodeId}`);

        console.log(`[Admin]  ${targetNodeId} için çalıştı.`);

        res.json({
            success: true,
            message: `♻️ ${targetNodeId} tekrar sisteme dönebilir.`,
            target: targetNodeId,
            action: 'POISON_PILL_REMOVED'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;