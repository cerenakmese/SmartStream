const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  event: {
    type: String,
    required: true,
    enum: ['session_start', 'session_end', 'user_join', 'user_leave', 'error', 'failover_trigger']
  },
  nodeId: {
    type: String,
    required: true
  },
  details: {
    type: Object, // Esnek veri yapısı (Hata mesajı, metrikler vb.)
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('CallLog', CallLogSchema);