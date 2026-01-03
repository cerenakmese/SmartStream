const { redisClient, redlock } = require('../config/redis');
const sessionStateService = require('./sessionState');

const NODE_ID = process.env.HOSTNAME || 'localhost';
const CHECK_INTERVAL = 10000; // 10 saniyede bir ölü kontrolü yap

class FailoverService {

    startMonitoring() {
        console.log(`[Failover] İzleme başlatıldı: ${NODE_ID}`);
        
        setInterval(async () => {
            await this.detectAndMigrate();
        }, CHECK_INTERVAL);
    }

    /**
     * Ölü node'ları bulur ve oturumlarını kurtarır
     */
    async detectAndMigrate() {
        try {
            // 1. Tüm kayıtlı node'ları getir
            const allNodes = await redisClient.smembers('active_nodes');

            for (const targetNodeId of allNodes) {
                // Kendi kendimizi kontrol etmeyelim
                if (targetNodeId === NODE_ID) continue;

                // 2. Node'un Redis'te hala anahtarı var mı?
                // (NodeManager'da TTL vermiştik, süre bittiyse anahtar silinmiştir)
                const exists = await redisClient.exists(`node:${targetNodeId}`);

                if (!exists) {
                    console.warn(`[Failover]  ÖLÜ NODE TESPİT EDİLDİ: ${targetNodeId}`);
                    
                    // 3. Race Condition Önleme: Aynı anda 5 sunucu birden kurtarmaya çalışmasın
                    // Sadece kilit alabilen "Kahraman" sunucu kurtarma işlemini yapar.
                    const lockKey = `lock:migration:${targetNodeId}`;
                    try {
                        const lock = await redlock.acquire([lockKey], 5000);
                        
                        // Kilit aldık, kurtarma operasyonu başlasın!
                        await this.migrateSessionsFrom(targetNodeId);
                        
                        // Ölü node'u listeden temizle
                        await redisClient.srem('active_nodes', targetNodeId);
                        
                        await lock.release();
                    } catch (e) {
                        // Kilit alınamadıysa başka bir node zaten kurtarıyordur, sorun yok.
                    }
                }
            }
        } catch (error) {
            console.error('[Failover] Hata:', error);
        }
    }

    /**
     * Ölen sunucunun oturumlarını (Session) kendine alır
     */
    async migrateSessionsFrom(deadNodeId) {
        console.log(`[Failover]  ${deadNodeId} üzerindeki oturumlar taşınıyor...`);
        
        // Redis'teki tüm session anahtarlarını bul (Gerçek projede SCAN kullanılır, şimdilik KEYS)
        const keys = await redisClient.keys('session:*');
        let count = 0;

        for (const key of keys) {
            const data = await redisClient.get(key);
            if (data) {
                const session = JSON.parse(data);
                
                // Eğer bu oturum ölen node'a aitse
                if (session.nodeId === deadNodeId) {
                    // Node ID'yi BENİM ID'm ile güncelle
                    session.nodeId = NODE_ID;
                    session.lastMigration = Date.now();
                    
                    // Güncellenmiş veriyi kaydet
                    await redisClient.set(key, JSON.stringify(session), 'EX', 86400);
                    count++;
                }
            }
        }
        
        if (count > 0) {
            console.log(`[Failover]  BAŞARILI: ${count} adet oturum ${NODE_ID} üzerine alındı.`);
        } else {
            console.log(`[Failover] Taşınacak oturum bulunamadı.`);
        }
    }
}

module.exports = new FailoverService();