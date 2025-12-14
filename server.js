const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); // CORS ekleyin

// --- Bağlantı Dosyaları ---
const connectDB = require('./src/config/db');
require('./src/config/redis');

// --- Rota Dosyaları ---
const authRoutes = require('./src/routes/authRoutes');
const sessionRoutes = require('./src/routes/sessions');

// Ortam Değişkenlerini Yükle
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.HOSTNAME || 'localhost';

// --- Middleware ---
app.use(cors()); // CORS ekleyin
app.use(express.json());

// --- Veritabanı Başlatma ---
connectDB();

// --- Rotalar (Routes) ---
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);

// --- Sağlık Kontrolleri (Health Checks) ---
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'UP', 
        service: 'ResilientStream API',
        node: NODE_ID 
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'ResilientStream API çalışıyor 🚀',
        node: NODE_ID,
        status: 'Healthy'
    });
});

// --- Sunucuyu Başlat ---
// ⭐ ÖNEMLİ: Docker için '0.0.0.0' kullanın
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${NODE_ID}] Sunucu ${PORT} portunda çalışıyor.`);
});