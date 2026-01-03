// test-packet-loss.js
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

let seqNum = 0; // Paket Sayaç

console.log(' Sunucuya bağlanılıyor...');

socket.on('connect', () => {
    console.log(`Bağlandı! Test Başlıyor...`);

    setInterval(() => {
        seqNum++; // Her döngüde numarayı artır (1, 2, 3...)

        // --- SABOTAJ (LOSS SIMULATION) ---
        // %20 ihtimalle paketi gönderme (Sanki ağda kaybolmuş gibi)
        // Sunucu 5 beklerken biz göndermeyip bir sonraki turda 6'yı atacağız.
        if (Math.random() < 0.2) {
            console.log(` [Simülasyon] Paket #${seqNum} düşürüldü (Gönderilmedi)`);
            return; // Bu turu pas geç
        }

        // Normal Gönderim
        socket.emit('net-ping', { 
            timestamp: Date.now(),
            seqNum: seqNum // Sıra numarasını ekledik
        });

    }, 100); // 100ms'de bir gönder
});

socket.on('net-pong', (data) => {
   const stats = data.networkStats;
    const qos = data.qosPolicy;

    console.log(`Puan: ${stats.healthScore} | Durum: ${qos.status} -> Emir: ${qos.action} (${qos.reason})`);
});