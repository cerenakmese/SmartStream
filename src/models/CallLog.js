const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    ref: 'Session',
    index: true
  },
  event: {
    type: String,
    required: true,
    enum: ['session_start', 'session_end', 'user_join', 'user_leave', 'error', 'failover_trigger', 'quality_report']
  },
  nodeId: {
    type: String,
    required: true
  },
  metrics: {
    averageJitter: Number,
    averagePacketLoss: Number,
    minHealthScore: Number, // En kötü anı görelim
    maxHealthScore: Number
  },
  qosEvents: [{
    timestamp: Date,
    action: String, // DROP_VIDEO, LOWER_RESOLUTION
    reason: String, // "Yüksek Kayıp (%15)"
    socketId: String
  }],

  details: {
    type: Object, // Esnek veri yapısı (Hata mesajı, metrikler vb.)
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

CallLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 3600 }); // 1 saat sonra otomatik silinsin

module.exports = mongoose.model('CallLog', CallLogSchema);