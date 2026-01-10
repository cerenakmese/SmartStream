const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  // Oturum Kimliği (Redis ile eşleşen ID)
  sessionId: {
    type: String,
    required: true,
    unique: false,
    index: true // Hızlı arama için indeks
  },

  // Oturumu başlatan kişi (Host)
  hostId: {
    type: String,
    required: true
  },

  // Oturumun yönetildiği sunucu (Hangi Node?)
  nodeId: {
    type: String,
    default: 'unknown'
  },

  // Oturum Durumu
  status: {
    type: String,
    enum: ['active', 'inactive', 'crashed'],
    default: 'inactive'
  },

  // Zaman Bilgileri
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },

  //  ÖNEMLİ: Oturum Bittiğinde Dolacak Rapor Alanı
  // sessionState.js içindeki deleteSession burayı dolduruyor
  metricsSummary: {
    totalDuration: { type: Number, default: 0 }, // Saniye cinsinden
    averageJitter: { type: Number, default: 0 },
    averagePacketLoss: { type: Number, default: 0 },
    averageHealthScore: { type: Number, default: 100 }
  },

  // Opsiyonel: Katılımcı listesi özeti (JSON array olarak saklayabiliriz)
  participantsHistory: {
    type: Array,
    default: []
  }
}, {
  timestamps: true // createdAt ve updatedAt otomatik oluşur
});

module.exports = mongoose.model('Session', SessionSchema);