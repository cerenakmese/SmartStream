const Redis = require('ioredis');
const RedlockLib = require('redlock');
const Redlock = RedlockLib.default || RedlockLib;

// 1. Redis Client Konfigürasyonu (Connection Pooling otomatiktir)
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  // Retry Stratejisi: Bağlantı koparsa tekrar dene
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null // Redlock için gerekli
});

// 2. Event Listener'lar (Loglama için)
redisClient.on('connect', () => console.log('✅ Redis Bağlantısı Başarılı'));
redisClient.on('error', (err) => console.error('❌ Redis Hatası:', err));

// 3. Distributed Lock (Redlock) Kurulumu
const redlock = new Redlock(
  [redisClient], // Tek node kullanıyoruz ama array ister
  {
    driftFactor: 0.01, // Saat kayması toleransı
    retryCount: 10,    // Kilit alamazsa kaç kere denesin?
    retryDelay: 200,   // Her deneme arası kaç ms beklesin?
    retryJitter: 200   // Rastgelelik ekle (hepsi aynı anda saldırmasın)
  }
);

redlock.on('error', (error) => {
  // Redlock hatalarını logla ama uygulamayı çökertme
  console.error('Redlock Hatası:', error);
});

// Fonksiyonu dışarı değil, direkt instance'ları dışarı açıyoruz
module.exports = { redisClient, redlock };