/**
 * Network Health Monitor
 * Amacı: Ham ağ verilerini işleyip Jitter, Packet Loss ve Sağlık Skoru üretmek.
 */
class NetworkMonitorService {

    constructor() {
        // Ağırlık katsayıları (Toplam 100 olmalı)
        this.WEIGHTS = {
            PACKET_LOSS: 50, // Kayıp çok önemli
            JITTER: 30,      // Dalgalanma önemli
            LATENCY: 20      // Gecikme daha tolere edilebilir
        };
    }

    /**
     * Jitter Hesaplama (RFC 3550 Standardı Basitleştirilmiş)
     * Formül: |(R2 - S2) - (R1 - S1)|
     */
    calculateJitter(currentLatency, prevLatency) {
        if (!prevLatency) return 0;
        return Math.abs(currentLatency - prevLatency);
    }

    /**
     * Sağlık Skoru Hesaplama (0 - 100 arası)
     * 100: Mükemmel
     * 0: Bağlantı Kopuk
     */
    calculateHealthScore(metrics) {
        const { packetLoss, jitter, latency } = metrics;
        let score = 100;

        // 1. Packet Loss Cezası (Her %1 kayıp için 10 puan düş)
        if (packetLoss > 0) {
            score -= (packetLoss * 10); // Örn: %3 kayıp -> -30 puan
        }

        // 2. Jitter Cezası (Her 10ms jitter için 5 puan düş)
        if (jitter > 0) {
            score -= (jitter / 10) * 5; // Örn: 50ms jitter -> -25 puan
        }

        // 3. Latency Cezası (100ms üzerindeki her 50ms için 5 puan düş)
        if (latency > 100) {
            score -= ((latency - 100) / 50) * 5;
        }

        // Skor 0'ın altına inemez, 100'ün üzerine çıkamaz
        return Math.max(0, Math.min(100, Math.floor(score)));
    }

    /**
     * Ana Analiz Fonksiyonu
     */
    analyzeNetwork(currentMetrics, prevMetrics = null) {
        // Eğer önceki veri yoksa varsayılan değerleri kullan
        const prevLatency = prevMetrics ? prevMetrics.latency : currentMetrics.latency;

        // Metrikleri Hesapla
        const jitter = this.calculateJitter(currentMetrics.latency, prevLatency);
        
        // İşlenmiş Veri Seti
        const analyzedMetrics = {
            latency: currentMetrics.latency,
            packetLoss: currentMetrics.packetLoss, // Client'tan % olarak gelir
            bandwidth: currentMetrics.bandwidth,   // kbps
            jitter: jitter,
            timestamp: Date.now()
        };

        // Skoru Hesapla
        const healthScore = this.calculateHealthScore(analyzedMetrics);
        
        return {
            metrics: analyzedMetrics,
            score: healthScore
        };
    }
}

module.exports = new NetworkMonitorService();