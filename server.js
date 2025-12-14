const express = require('express');
const dotenv = require('dotenv');

// --- Bağlantı Dosyaları ---
// (Not: Ceren'in dosyalarını src klasörüne göre güncelledik)
const connectDB = require('./src/config/db');           // Senin MongoDB bağlantın
const { connectRedis } = require('./src/config/redis'); // Ceren'in Redis bağlantısı (Dosya yoluna dikkat!)

// --- Rota Dosyaları ---
const authRoutes = require('./src/routes/authRoutes');      // Senin Auth rotan
const sessionRoutes = require('./src/routes/sessions');     // Ceren'in Session rotası

// Ortam Değişkenlerini Yükle
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.HOSTNAME || 'localhost';

// --- Middleware ---
app.use(express.json()); // JSON verilerini okumak için şart

// --- Veritabanı Başlatma ---
// 1. MongoDB'ye bağlan (Senin kodun)
connectDB();

// 2. Redis'e bağlan (Ceren'in kodu)
// NOT: connectRedis fonksiyonunun hata yönetimi olduğundan emin olmalıyız
if (typeof connectRedis === 'function') {
    connectRedis(); 
} else {
    console.log('UYARI: Redis bağlantı fonksiyonu bulunamadı veya yapılandırılmadı.');
}

// --- Rotalar (Routes) ---
app.use('/api/auth', authRoutes);       // Örn: /api/auth/register
app.use('/api/sessions', sessionRoutes); // Örn: /api/sessions/create

// --- Sağlık Kontrolleri (Health Checks) ---
// Swarm ve Docker için basit kontrol
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'UP', 
        service: 'ResilientStream API',
        node: NODE_ID 
    });
});

// Ana sayfa karşılama mesajı
app.get('/', (req, res) => {
    res.json({
        message: 'ResilientStream API çalışıyor 🚀',
        node: NODE_ID,
        status: 'Healthy'
    });
});

// --- Sunucuyu Başlat ---
app.listen(PORT, () => {
    console.log(`[${NODE_ID}] Sunucu ${PORT} portunda çalışıyor.`);
});