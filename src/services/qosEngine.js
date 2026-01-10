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
      * @param {Object} analyzedData - Metrikler
      * @param {Object} userSettings - Kullanıcı Ayarları
      */
    determineQualityStrategy(analyzedData, userSettings = {}) {
        const { metrics } = analyzedData;
        const preference = userSettings.qosPreference || 'balanced';

        // --- SENARYO A: AUDIO ONLY (Kullanıcı "Video istemiyorum" dedi) ---
        if (preference === 'audio-only') {
            return {
                action: 'AUDIO_ONLY',
                videoQuality: 'OFF',
                priorityQueue: 'HIGH',
                reason: 'User Preference: Audio Only'
            };
        }

        // --- SENARYO B: HIGH QUALITY (Kullanıcı "Video Kapanmasın" dedi) ---
        if (preference === 'high-quality') {
            // Normalde %3 olan sınırı %15'e çıkarıyoruz (Daha toleranslı)
            const AGGRESSIVE_LOSS_LIMIT = 15;

            if (metrics.packetLoss > AGGRESSIVE_LOSS_LIMIT) {
                // Artık çaresiziz, mecburen kapatıyoruz
                return {
                    action: 'DROP_VIDEO',
                    videoQuality: 'OFF',
                    priorityQueue: 'HIGH',
                    reason: `Critical Loss in High-Quality Mode: ${metrics.packetLoss}%`
                };
            }

            // Eğer kayıp var ama %15'in altındaysa: Videoyu KAPATMA, sadece KALİTEYİ DÜŞÜR
            if (metrics.packetLoss > 3 || metrics.jitter > 100) {
                return {
                    action: 'LOWER_QUALITY', // DROP_VIDEO yerine
                    videoQuality: 'LOW',     // Çamur gibi olsun ama video olsun
                    priorityQueue: 'NORMAL',
                    reason: 'Forcing Video in Bad Network'
                };
            }

            // Her şey yolunda
            return {
                action: 'MAINTAIN',
                videoQuality: 'HIGH',
                reason: 'High Quality Mode Active'
            };
        }

        if (preference === 'video-only') {

            // Eğer paket kaybı ÇOK fazlaysa (%15+), videoyu da mecbur düşürürüz ama kapatmayız
            if (metrics.packetLoss > 15) {
                return {
                    action: 'DROP_AUDIO_LOWER_VIDEO', // Hem sesi kapat, hem kaliteyi düşür
                    videoQuality: 'LOW',
                    priorityQueue: 'HIGH',
                    reason: `Critical Loss (${metrics.packetLoss}%): Sacrificing Audio`
                };
            }

            // Eğer orta seviye kayıp varsa (%3 - %15 arası)
            // Normalde videoyu kapatırdık, şimdi SESİ kapatıyoruz.
            if (metrics.packetLoss > 3 || metrics.bandwidth < 300) {
                return {
                    action: 'DROP_AUDIO',   // <--- Kritik Fark Burada
                    videoQuality: 'HIGH',   // Videoyu yüksek kalitede tutmaya çalış
                    priorityQueue: 'HIGH',
                    reason: 'Video Only Mode: Dropping Audio to save bandwidth'
                };
            }

            // Her şey yolunda
            return {
                action: 'MAINTAIN',
                videoQuality: 'HIGH',
                reason: 'Video Only Mode Active'
            };
        }

        // --- SENARYO C: BALANCED (Varsayılan Hassas Ayar) ---
        // 1. Packet Loss > %3 -> Direkt Video Drop
        if (metrics.packetLoss > this.THRESHOLDS.PACKET_LOSS_CRITICAL) {
            return {
                action: 'DROP_VIDEO',
                videoQuality: 'OFF',
                priorityQueue: 'HIGH',
                reason: `Packet Loss > 3% (${metrics.packetLoss}%)`
            };
        }

        // 2. Bandwidth Düşük -> Audio Only
        if (metrics.bandwidth < this.THRESHOLDS.BANDWIDTH_MIN) {
            return {
                action: 'AUDIO_ONLY',
                videoQuality: 'OFF',
                priorityQueue: 'HIGH',
                reason: 'Low Bandwidth'
            };
        }

        // 3. Jitter Yüksek -> Kalite Düşür
        if (metrics.jitter > this.THRESHOLDS.JITTER_WARNING) {
            return {
                action: 'LOWER_QUALITY',
                videoQuality: 'LOW',
                reason: `High Jitter: ${metrics.jitter}ms`
            };
        }

        return {
            action: 'MAINTAIN',
            videoQuality: 'HIGH',
            priorityQueue: 'NORMAL',
            reason: 'Network Stable'
        };
    }
}

module.exports = new QosEngineService();