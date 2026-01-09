const { redisClient, redlock } = require('../config/redis');
const sessionStateService = require('./sessionState');

let NODE_ID = process.env.HOSTNAME || 'localhost';


const CHECK_INTERVAL = 10000;

class FailoverService {

    startMonitoring() {
        console.log(`[Failover] İzleme başlatıldı: ${NODE_ID}`);

        setInterval(async () => {
            await this.detectAndMigrate();
            // 👇 YENİ: Kendi kendine iyileştirme (Yetim oturumları topla)
            await this.reclaimOrphanedSessions();
        }, CHECK_INTERVAL);
    }

    async detectAndMigrate() {
        try {
            const allKnownNodes = await redisClient.smembers('known_nodes');
            const activeNodes = await redisClient.smembers('active_nodes');

            for (const targetNodeId of allKnownNodes) {
                if (targetNodeId === NODE_ID) continue;

                const isAlive = activeNodes.includes(targetNodeId);

                if (!isAlive) {
                    const exists = await redisClient.exists(`node:${targetNodeId}`);

                    if (!exists) {
                        const lockKey = `lock:migration:${targetNodeId}`;
                        try {
                            const lock = await redlock.acquire([lockKey], 5000);
                            console.warn(`[Failover] 🚨 ÖLÜ NODE TESPİT EDİLDİ: ${targetNodeId}`);
                            await this.migrateSessionsFrom(targetNodeId);
                            await lock.release();
                        } catch (e) { }
                    }
                }
            }
        } catch (error) {
            console.error('[Failover] Hata:', error);
        }
    }

    // 👇 YENİ FONKSİYON: Sahipsiz oturumları kurtar
    async reclaimOrphanedSessions() {
        try {
            const keys = await redisClient.keys('session:*');
            const activeNodes = await redisClient.smembers('active_nodes');

            for (const key of keys) {
                const sessionData = await redisClient.hgetall(key);

                // Eğer oturumun node'u "aktifler listesinde" yoksa, o oturum yetimdir!
                if (sessionData && sessionData.nodeId && !activeNodes.includes(sessionData.nodeId)) {

                    // Kilit alıp oturumu üzerimize alalım
                    const lockKey = `lock:reclaim:${key}`;
                    try {
                        const lock = await redlock.acquire([lockKey], 3000);

                        console.log(`[Failover] 🏚️ Yetim oturum bulundu: ${sessionData.sessionId} (Eski Sahip: ${sessionData.nodeId}) -> Bana Geçiyor`);

                        await redisClient.hset(key, {
                            nodeId: NODE_ID,
                            lastMigration: Date.now()
                        });
                        await redisClient.expire(key, 3600);

                        await lock.release();
                    } catch (e) {
                        // Kilit alınamadı, başka biri alıyor olabilir
                    }
                }
            }
        } catch (error) {
            console.error('[Failover] Reclaim Hatası:', error);
        }
    }

    async migrateSessionsFrom(deadNodeId) {
        const keys = await redisClient.keys('session:*');
        let count = 0;

        for (const key of keys) {
            const sessionData = await redisClient.hgetall(key);

            if (sessionData && sessionData.nodeId === deadNodeId) {
                await redisClient.hset(key, {
                    nodeId: NODE_ID,
                    lastMigration: Date.now()
                });
                await redisClient.expire(key, 3600);

                count++;
                console.log(`[Failover] ♻️ Oturum kurtarıldı: ${sessionData.id || key} -> ${NODE_ID}`);
            }
        }

        if (count > 0) {
            console.log(`[Failover] ✅ TOPLAM: ${count} oturum başarıyla ${NODE_ID} üzerine alındı.`);
        }
    }
}

module.exports = new FailoverService();