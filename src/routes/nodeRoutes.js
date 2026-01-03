const express = require('express');
const router = express.Router();
const { redisClient } = require('../config/redis');

// Dosya ismine dikkat (nodeManagerService veya NodeManagerService)
// Senin dosya yapına göre doğrusunu seç:
const nodeManager = require('../services/nodeManager'); 

// @desc    Aktif Node'ları Listele
// @route   GET /api/nodes/available
router.get('/available', async (req, res) => {
  try {
    
    const nodeIds = await redisClient.smembers('active_nodes'); 
    
    const nodes = [];
    
    for (const id of nodeIds) {
        
        const info = await redisClient.hgetall(`node:${id}`);
        
        if (info && Object.keys(info).length > 0) {
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
router.get('/:id/health', (req, res) => {
    res.status(200).json({
        nodeId: req.params.id,
        status: 'Healthy ',
        uptime: process.uptime()
    });
});

// @desc    Chaos Monkey: Node'u öldür
router.post('/register', async (req, res) => {
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