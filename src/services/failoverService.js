const { redisClient, redlock } = require('../config/redis');


let NODE_ID = process.env.HOSTNAME || 'localhost';


const CHECK_INTERVAL = 10000;

class FailoverService {

    startMonitoring() {
        console.log(`[Failover] İzleme başlatıldı: ${NODE_ID}`);


        setInterval(async () => {
            await this.detectAndMigrate();
            await this.reclaimOrphanedSessions();
        }, CHECK_INTERVAL);


        setInterval(async () => {
            await this.updateSessionHealthStatus();
        }, 3000);
    }

    async updateSessionHealthStatus() {
        try {
            const keys = await redisClient.keys('session:*');
            const activeNodes = await redisClient.smembers('active_nodes');

            for (const key of keys) {
                const sessionData = await redisClient.hgetall(key);
                if (!sessionData || !sessionData.nodeId) continue;

                const isNodeAlive = activeNodes.includes(sessionData.nodeId);

                // SENARYO 1: Node ÖLMÜŞ ama veritabanında hala 'Active' -> BOZ
                if (!isNodeAlive && sessionData.status === 'active') {
                    console.log(`[HealthCheck] 💀 Node (${sessionData.nodeId}) ölü! Session (${sessionData.id}) CRITICAL işaretleniyor.`);

                    const crashMetrics = JSON.stringify({ healthScore: 0, packetLoss: 100, jitter: 9999, bandwidth: 0 });

                    await redisClient.hmset(key, {
                        'status': 'network_error',
                        'networkMetrics': crashMetrics
                    });
                }

                // SENARYO 2: Node GERİ GELMİŞ ama veri 'Error' -> DÜZELT
                else if (isNodeAlive && sessionData.status === 'network_error') {
                    console.log(`[HealthCheck] 🌤️ Node (${sessionData.nodeId}) geri geldi! Session (${sessionData.id}) iyileştiriliyor.`);

                    const healthyMetrics = JSON.stringify({ healthScore: 100, packetLoss: 0, jitter: 0, bandwidth: 0 });

                    await redisClient.hmset(key, {
                        'status': 'active',
                        'networkMetrics': healthyMetrics
                    });
                }
            }
        } catch (error) {
            console.error('[HealthCheck] Tarama hatası:', error);
        }
    }

    async detectAndMigrate() {
        try {
            // 1. Mevcut listeleri çek
            const allKnownNodes = await redisClient.smembers('known_nodes');
            const activeNodes = await redisClient.smembers('active_nodes');

            // --- 🛑 YENİ EKLENEN KISIM: KENDİNİ KONTROL ET (Self-Check) ---
            // Eğer ben (NODE_ID) aktif listesinde yoksam, ben de "Zombi" olmuşumdur.
            // Bu durumda işlem yapmayı hemen durdur.
            if (!activeNodes.includes(NODE_ID)) {
                // Log kirliliği olmasın diye buraya console.log koymuyoruz.
                // Sessizce kenara çekiliyoruz.
                return;
            }
            // --------------------------------------------------------------

            for (const targetNodeId of allKnownNodes) {
                // Kendimi zaten yukarıda kontrol ettim, o yüzden döngüde kendimi atla
                if (targetNodeId === NODE_ID) continue;

                const isAlive = activeNodes.includes(targetNodeId);

                if (!isAlive) {
                    // Node aktif listede yok, peki heartbeat anahtarı (TTL) tamamen bitmiş mi?
                    const exists = await redisClient.exists(`node:${targetNodeId}`);

                    if (!exists) {
                        const lockKey = `lock:migration:${targetNodeId}`;
                        try {
                            // Çakışmayı önlemek için Lock al
                            const lock = await redlock.acquire([lockKey], 5000);

                            console.warn(`[Failover] 🚨 ÖLÜ NODE TESPİT EDİLDİ: ${targetNodeId}`);

                            // Ölen node'un oturumlarını bana taşı
                            await this.migrateSessionsFrom(targetNodeId);

                            await lock.release();
                        } catch (e) {
                            // Lock alınamadıysa başkası hallediyordur, sorun yok.
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Failover] Hata:', error);
        }
    }


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

                        // Hatalı Satır: ... Yetim oturum bulundu: ${sessionData.sessionId} ...
                        // 👇 DOĞRUSU (sessionData.id olmalı):

                        console.log(`[Failover] 🏚️ Yetim oturum bulundu: ${sessionData.id} (Eski Sahip: ${sessionData.nodeId}) -> Bana Geçiyor`);

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