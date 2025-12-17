// src/services/qosService.js

const qosService = {
    /**
     * Ağ Durumuna Göre Karar Ver (Decision Engine)
     * @param {object} metrics - { jitter, packetLoss, healthScore }
     * @returns {object} - { status, action, message }
     */
    decideQualityPolicy(metrics) {
        const { jitter, packetLoss, healthScore } = metrics;

        // 1. KRİTİK DURUM (Video Drop)
        // Kural: Packet Loss > %3 veya Puan < 50
        if (packetLoss > 3 || healthScore < 50) {
            return {
                status: 'CRITICAL',
                action: 'DROP_VIDEO',
                config: { video: false, audio: true, quality: 'low' },
                reason: `Yüksek Kayıp (%${packetLoss})`
            };
        }

        // 2. UYARI DURUMU (Adaptive Bitrate)
        // Kural: Jitter > 50ms veya Puan < 75
        if (jitter > 50 || healthScore < 75) {
            return {
                status: 'WARNING',
                action: 'LOWER_RESOLUTION',
                config: { video: true, audio: true, quality: 'medium' },
                reason: `Yüksek Jitter (${jitter}ms)`
            };
        }

        // 3. STABİL DURUM
        return {
            status: 'STABLE',
            action: 'MAINTAIN_QUALITY',
            config: { video: true, audio: true, quality: 'high' },
            reason: 'Ağ Sağlıklı'
        };
    }
};

module.exports = qosService;