const { redisClient } = require('../config/redis');

// Kimlik Belirleme
let NODE_ID = process.env.HOSTNAME || 'localhost';


const HEARTBEAT_INTERVAL = 3000;
const NODE_TTL = 10;

class NodeManagerService {

    constructor() {
        this.isActive = true; // İyimser başlangıç (Sunucu açılır açılmaz aktif)
        this.isSimulatedDead = false;
        this.timer = null;
    }

    /**
     * Sunucu başladığında kendini sisteme kaydeder
     */
    async startHeartbeat() {
        if (!this.isActive) {
            console.log(`[NodeManager]  Heartbeat başlatıldı: ${NODE_ID}`);
            this.isActive = true;
        }

        // 1. Önce sistemi canlandır (Kendini kaydet)
        await this.registerNode();

        // 2. Döngüyü başlat
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(async () => {
            await this.checkAndBeat();
        }, HEARTBEAT_INTERVAL);

        // 3. TARAMAYI GECİKMELİ VE BAĞIMSIZ BAŞLAT (Deadlock Çözümü)
        // Node.js modül yükleme sırasındaki döngüsel bağımlılığı (Circular Dependency)
        // aşmak için failoverService'i burada, gecikmeli olarak çağırıyoruz.
        setImmediate(async () => {
            try {
                // Biraz bekle ki sistem tam otursun
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Servisi dinamik olarak al
                const failover = require('./failoverService');



                // Failover servisindeki yetim toplama fonksiyonunu çalıştır
                // (İsmi reclaimOrphanedSessions olarak belirlemiştik)
                if (failover.reclaimOrphanedSessions) {
                    await failover.reclaimOrphanedSessions();
                }
            } catch (err) {
                console.error("[NodeManager] Rebalance hatası:", err.message);
            }
        });
    }

    /**
     * Döngü: Hayatta mıyım kontrol et ve heartbeat at
     */
    async checkAndBeat() {
        try {
            // ZEHİR KONTROLÜ
            const isPoisoned = await redisClient.get(`poison:${NODE_ID}`);

            if (isPoisoned) {
                // Eğer daha önce aktifse logla ve kapat
                if (this.isActive) {
                    console.warn(`[NodeManager] Öldürüldü. Process sonlandırılıyor...`);

                    this.isActive = false;
                    await redisClient.srem('active_nodes', NODE_ID);
                    await redisClient.del(`node:${NODE_ID}`);

                    setTimeout(() => {
                        console.log(`[NodeManager] (Exit Code 1)`);
                        process.exit(1); // 1: Hata ile çıkış (Crash simülasyonu)
                    }, 100);
                    // ----------------------------
                }
                return;
            }

            // SİMÜLASYON KONTROLÜ
            if (this.isSimulatedDead) return;

            // DİRİLME KONTROLÜ (Auto-Revive)
            if (!this.isActive) {
                console.log(`[NodeManager] 🚑 İYİLEŞTİM! Tekrar göreve dönüyorum.`);
                this.isActive = true;
                await this.registerNode();

                // Dirilince de bir tarama yapmak iyidir
                const failover = require('./failoverService');
                failover.reclaimOrphanedSessions().catch(() => { });
            }

            // KALP ATIŞI
            if (this.isActive) {
                await this.updateHeartbeat();
            }

        } catch (error) {
            console.error('[NodeManager] Döngü Hatası:', error.message);
        }
    }

    async registerNode() {
        const key = `node:${NODE_ID}`;
        const nodeInfo = {
            id: NODE_ID,
            lastSeen: Date.now(),
            load: 0,
            status: 'active'
        };

        await redisClient.hset(key, nodeInfo);
        await redisClient.sadd('active_nodes', NODE_ID);
        await redisClient.sadd('known_nodes', NODE_ID);
        await redisClient.expire(key, NODE_TTL);
        console.log(`[NodeManager] Node sisteme kaydedildi: ${NODE_ID}`);
    }

    async updateHeartbeat() {
        await redisClient.expire(`node:${NODE_ID}`, NODE_TTL);
        await redisClient.hset(`node:${NODE_ID}`, 'lastSeen', Date.now());
    }

    async simulateCrash() {
        this.isSimulatedDead = true;
        this.isActive = false;
        console.log(`[NodeManager] 🚨 SİMÜLASYON: Yerel çökertme başlatıldı!`);
    }

    async stopHeartbeat() {
        this.isActive = false;
        clearInterval(this.timer);
        await redisClient.srem('active_nodes', NODE_ID);
        await redisClient.del(`node:${NODE_ID}`);
        console.log(`[NodeManager] Node sistemden ayrıldı: ${NODE_ID}`);
    }
}

module.exports = new NodeManagerService();