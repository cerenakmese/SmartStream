const { client } = require('../config/redis');
const NODE_ID = process.env.HOSTNAME || 'localhost';

// 1. Yeni Oturum (Oda) Oluştur
exports.createSession = async (req, res) => {
    try {
        const sessionId = 'room-' + Math.floor(Math.random() * 100000);
        const { hostName } = req.body; // Gönderen kişinin adı

        // Redis'e Hash olarak kaydet (Oda bilgileri)
        // Anahtar: room-12345, Veri: { host: Ali, node: node-1, status: active }
        await client.hSet(sessionId, {
            host: hostName || 'Anonymous',
            node: NODE_ID,
            createdAt: new Date().toISOString(),
            status: 'active'
        });

        // Odayı 1 saat sonra otomatik sil (Expire - 3600 saniye)
        await client.expire(sessionId, 3600);

        res.status(201).json({
            success: true,
            message: 'Oturum oluşturuldu',
            sessionId: sessionId,
            hostedByNode: NODE_ID
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. Oturuma Katıl
exports.joinSession = async (req, res) => {
    try {
        const { id } = req.params; // URL'den gelen ID (room-12345)

        // Önce oda var mı diye kontrol et
        const sessionExists = await client.exists(id);

        if (!sessionExists) {
            return res.status(404).json({ error: 'Oturum bulunamadı veya süresi doldu.' });
        }

        // Odanın bilgilerini çek
        const sessionData = await client.hGetAll(id);

        res.json({
            success: true,
            message: 'Oturuma katıldınız',
            session: sessionData,
            connectedVia: NODE_ID
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. Kalp Atışı (Heartbeat) - Oturumu canlı tut
exports.heartbeat = async (req, res) => {
    try {
        const { id } = req.params;
        // Odanın süresini tekrar 1 saate uzat
        await client.expire(id, 3600);

        res.json({ success: true, status: 'alive' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};