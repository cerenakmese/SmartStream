/**
 * QoS (Quality of Service) Engine
 * Amacı: Network durumuna göre yayın stratejisini belirlemek.
 */
class QosEngineService {
    
    constructor() {
        // Senin Belirlediğin Kritik Eşikler (Thresholds)
        this.THRESHOLDS = {
            JITTER_WARNING: 50,      // ms
            PACKET_LOSS_CRITICAL: 3, // % (Yüzde 3)
            BANDWIDTH_MIN: 100       // kbps
        };
    }

    /**
     * Karar Mekanizması
     * @param {Object} analyzedData - NetworkMonitor'den gelen işlenmiş veri
     */
    determineQualityStrategy(analyzedData) {
        const { metrics, score } = analyzedData;
        
        // Varsayılan Strateji: Her şey yolunda
        let decision = {
            action: 'MAINTAIN',       // MAINTAIN, DROP_VIDEO, AUDIO_ONLY
            videoQuality: 'HIGH',     // HIGH, MEDIUM, LOW, OFF
            priorityQueue: 'NORMAL',  // NORMAL, HIGH
            reason: 'Network stable'
        };

        // 1. KURAL: Packet Loss > %3 -> Video Drop (Sadece Ses)
        if (metrics.packetLoss > this.THRESHOLDS.PACKET_LOSS_CRITICAL) {
            decision.action = 'DROP_VIDEO';
            decision.videoQuality = 'OFF';
            decision.priorityQueue = 'HIGH'; // Ses paketlerine öncelik ver
            decision.reason = `Critical Packet Loss detected: ${metrics.packetLoss}%`;
            return decision; // En kritik karar bu, hemen dön
        }

        // 2. KURAL: Bandwidth < 100kbps -> Audio Only
        if (metrics.bandwidth < this.THRESHOLDS.BANDWIDTH_MIN) {
            decision.action = 'AUDIO_ONLY';
            decision.videoQuality = 'OFF';
            decision.priorityQueue = 'HIGH';
            decision.reason = `Low Bandwidth: ${metrics.bandwidth}kbps`;
            return decision;
        }

        // 3. KURAL: Jitter > 50ms -> Warning (Kaliteyi düşür)
        if (metrics.jitter > this.THRESHOLDS.JITTER_WARNING) {
            decision.action = 'LOWER_QUALITY';
            decision.videoQuality = 'LOW'; // Keyframe'leri koru, çözünürlüğü düşür
            decision.priorityQueue = 'NORMAL';
            decision.reason = `High Jitter detected: ${metrics.jitter}ms`;
            return decision;
        }

        // Eğer skor çok düşükse (Genel sağlık kötü)
        if (score < 50) {
            decision.action = 'LOWER_QUALITY';
            decision.videoQuality = 'MEDIUM';
            decision.reason = `Low Health Score: ${score}`;
        }

        return decision;
    }
}

module.exports = new QosEngineService();