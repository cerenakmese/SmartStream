const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  nodeId: { type: String },
  status: { 
    type: String, 
    enum: ['active', 'ended', 'crashed'], 
    default: 'active' 
  },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },

  // 👇 YENİ: Oturum Karnesi (Özet Metrikler)
  metricsSummary: {
    averageJitter: { type: Number, default: 0 },
    averagePacketLoss: { type: Number, default: 0 },
    averageHealthScore: { type: Number, default: 100 },
    totalDuration: { type: Number, default: 0 } // Saniye cinsinden
  }
});

module.exports = mongoose.model('Session', SessionSchema);