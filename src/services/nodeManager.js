const { redisClient } = require('../config/redis');

const NODE_ID = process.env.HOSTNAME || 'localhost';
const HEARTBEAT_INTERVAL = 5000; // 5 saniyede bir "Ben buradayım" de
const NODE_TTL = 15; // 15 saniye ses çıkmazsa öldü say

class NodeManagerService {

    constructor() {
        this.isActive = false;
    }

    /**
     * Sunucu başladığında kendini sisteme kaydeder
     */
    async startHeartbeat() {
        this.isActive = true;
        console.log(`[NodeManager] Heartbeat başlatıldı: ${NODE_ID}`);

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
        
        // 3. TTL (Süre) koy - Eğer güncellemezsem 15 sn sonra Redis beni silsin
        await redisClient.expire(key, NODE_TTL);
    }

    async updateHeartbeat() {
        // Sadece süreyi uzat (Expire süresini tekrar 15 sn yap)
        await redisClient.expire(`node:${NODE_ID}`, NODE_TTL);
        // LastSeen güncelle
        await redisClient.hset(`node:${NODE_ID}`, 'lastSeen', Date.now());
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