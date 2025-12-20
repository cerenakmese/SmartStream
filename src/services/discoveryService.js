const { redisClient } = require('../config/redis');

// Sunucunun benzersiz kimliği
const NODE_ID = process.env.HOSTNAME || `node-${Math.floor(Math.random() * 1000)}`;
const HEARTBEAT_INTERVAL = 5000; // 5 saniyede bir sinyal
const NODE_TTL = 10; // 10 saniye ses çıkmazsa öldü sayılır

let heartbeatTimer;

const discoveryService = {
  
  // Sunucuyu Sisteme Kaydet ve Nabız Başlat
  async registerNode() {
    try {
      await this.sendHeartbeat();
      console.log(`✅ [Discovery] Node Kaydedildi: ${NODE_ID}`);

      // Periyodik Nabız (Heartbeat) Başlat
      heartbeatTimer = setInterval(async () => {
        await this.sendHeartbeat();
      }, HEARTBEAT_INTERVAL);

    } catch (error) {
      console.error('❌ [Discovery] Kayıt Hatası:', error);
    }
  },

  // Redis'e "Ben Yaşıyorum" sinyali gönder
  async sendHeartbeat() {
    const key = `service:node:${NODE_ID}`;
    const value = JSON.stringify({
      id: NODE_ID,
      lastSeen: Date.now(),
      status: 'UP'
    });

    // Redis'e yaz ve 10 saniye ömür biç (Expire)
    await redisClient.set(key, value, 'EX', NODE_TTL);
  },

  // Kapatırken temizlik yap
  async unregisterNode() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    const key = `service:node:${NODE_ID}`;
    await redisClient.del(key);
    console.log(`👋 [Discovery] Node Silindi: ${NODE_ID}`);
  }
};

module.exports = discoveryService;