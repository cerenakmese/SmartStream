// src/services/qosService.js
const analyticsService = require('./analyticsService');

const qosService = {
  
  // Karar Mekanizması
  decideQualityPolicy(metrics) {
    let decision = {
      status: 'STABLE',
      action: 'NONE',
      reason: ''
    };

    // 1. Kritik Hata Kontrolü (Örn: Paket Kaybı > %15)
    if (metrics.packetLoss > 15 || metrics.jitter > 100) {
      decision.status = 'CRITICAL';
      decision.action = 'DROP_VIDEO'; // Videoyu kapat
      decision.reason = `Kritik Paket Kaybı: %${metrics.packetLoss.toFixed(2)}`;
    } 
    // 2. Uyarı Durumu (Örn: Jitter > 50ms)
    else if (metrics.jitter > 50) {
      decision.status = 'WARNING';
      decision.action = 'LOWER_RESOLUTION'; // Çözünürlüğü düşür
      decision.reason = `Yüksek Jitter: ${metrics.metrics?.jitter || metrics.jitter}ms`;
    }

    // --- ENTEGRASYON KISMI BURASI ---
    // Eğer durum STABLE değilse, bunu veritabanına raporla!
    // (Async olduğu için await beklemeden fire-and-forget yapabiliriz)
    if (decision.status !== 'STABLE') {
        // Session ID'yi metrics objesinden veya socket'ten bulmamız lazım.
        // Şimdilik test için statik veya metrics'ten gelen bir ID kullanacağız.
        // NOT: metricsService'in sessionId dönmesi gerekir.
        
        // Geçici olarak "unknown-session" diyoruz, birazdan Socket servisinde bağlayacağız.
        const sessionId = metrics.sessionId || 'active-session'; 
        const nodeId = process.env.HOSTNAME || 'node-unknown';

        analyticsService.logQoSEvent(sessionId, nodeId, metrics, decision);
    }
    // -------------------------------

    return decision;
  }
};

module.exports = qosService;