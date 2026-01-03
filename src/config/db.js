const mongoose = require('mongoose');

// Fonksiyonu önce tanımlıyoruz
const connectDB = async () => {
  try {
    // Docker servis adı 'mongo' olduğu için connection string böyle olmalı:
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/smartstream');
    
    console.log(`MongoDB Bağlantısı Başarılı: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Bağlantı Hatası: ${error.message}`);
    
    // Hata durumunda 5 saniye bekleyip tekrar deniyoruz (Retry Logic)
    console.log("5 saniye içinde tekrar deneniyor...");
    setTimeout(connectDB, 5000);
  }
};

// !!! EN ÖNEMLİ KISIM: Dışarı aktarma işlemi EN SONDA olmalı !!!
module.exports = connectDB;