const { redisClient } = require('../config/redis');

const NODE_ID = process.env.HOSTNAME || 'localhost';

// Demo için süreleri optimize ettik: 
// 3 saniyede bir kalp atışı, 8 saniye ses çıkmazsa öldü say.
const HEARTBEAT_INTERVAL = 3000;
const NODE_TTL = 8;

class NodeManagerService {

    constructor() {
        this.isActive = false;
        this.timer = null;
    }

    /**
     * Sunucu başladığında kendini sisteme kaydeder
     */
    async startHeartbeat() {
        if (this.isActive) return; // Zaten çalışıyorsa tekrar başlatma

        this.isActive = true;
        console.log(`[NodeManager] 🟢 Heartbeat başlatıldı: ${NODE_ID}`);

        // İlk kaydı yap
        await this.registerNode();

        // Periyodik olarak güncelle
        this.timer = setInterval(async () => {
            if (this.isActive) await this.updateHeartbeat();
        }, HEARTBEAT_INTERVAL);
    }

    /**
     * Redis'e "Ben yaşıyorum" ve "Yüküm şu kadar" bilgisini yazar
     */
    async registerNode() {
        const key = `node:${NODE_ID}`;
        const nodeInfo = {
            id: NODE_ID,
            lastSeen: Date.now(),
            load: 0, // İleride buraya CPU/Session sayısı gelecek
            status: 'active'
        };

        // 1. Node bilgisini Hash olarak kaydet
        await redisClient.hset(key, nodeInfo);

        // 2. Bu Node'u "Aktif Node'lar Listesi"ne ekle (Set yapısı)
        await redisClient.sadd('active_nodes', NODE_ID);

        // 3. TTL (Süre) koy - Eğer güncellemezsem süre bitince Redis beni silsin
        await redisClient.expire(key, NODE_TTL);
    }

    async updateHeartbeat() {
        // Sadece süreyi uzat
        await redisClient.expire(`node:${NODE_ID}`, NODE_TTL);
        // LastSeen güncelle
        await redisClient.hset(`node:${NODE_ID}`, 'lastSeen', Date.now());
    }

    // --- YENİ EKLENEN: ÖLÜM SİMÜLASYONU (CHAOS MONKEY) ---
    /**
     * Sunucuyu kapatmadan kalp atışını durdurur.
     * Böylece diğer sunucular bu sunucuyu "ölü" sanıp failover başlatır.
     */
    async simulateCrash() {
        this.isActive = false;
        clearInterval(this.timer);
        console.log(`[NodeManager] 🔴 SİMÜLASYON: Bu node artık ölü taklidi yapıyor! (${NODE_ID})`);
        // Not: Redis'ten bilerek silmiyoruz. Sürenin (TTL) kendiliğinden dolmasını bekliyoruz.
    }

    /**
     * Uygulama kapanırken (Graceful Shutdown) çalışır
     */
    async stopHeartbeat() {
        this.isActive = false;
        clearInterval(this.timer);
        // Kendini aktif listeden sil
        await redisClient.srem('active_nodes', NODE_ID);
        await redisClient.del(`node:${NODE_ID}`);
        console.log(`[NodeManager] Node sistemden ayrıldı: ${NODE_ID}`);
    }
}

module.exports = new NodeManagerService();