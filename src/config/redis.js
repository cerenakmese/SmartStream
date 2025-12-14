const { createClient } = require('redis');

// Ortam değişkenlerinden veya varsayılan değerden URL al
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

const client = createClient({
    url: REDIS_URL
});

client.on('error', (err) => console.log('Redis Client Error', err));
client.on('connect', () => console.log('Redis bağlantısı başarılı! 🚀'));

// Bağlantıyı başlat ve client'ı dışarı aktar
const connectRedis = async () => {
    if (!client.isOpen) {
        await client.connect();
    }
    return client;
};

module.exports = { client, connectRedis };