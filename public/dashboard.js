// ==========================================
// RESILIENT STREAM - DASHBOARD CONTROLLER (FINAL)
// ==========================================

// --- GLOBAL DEĞİŞKENLER ---
let socket = null;
let authToken = localStorage.getItem('authToken');
let qosChart = null; // Grafik nesnesi

// Simülasyon Durumu
let simulationInterval = null;
let isSimulating = false;
let seqNum = 0;
let currentSessionId = null; // Kullanıcının aktif olduğu oturum
let simParams = { lossProb: 0, jitter: 0 };
let activeNodeList = [];
let lastPongTime = Date.now(); // Son gelen verinin zamanı
let wasStreamingBeforeDisconnect = false;
const TIMEOUT_MS = 4000;

const KNOWN_NODES = ['node-primary', 'node-backup'];


// ------------------------------------------------------------------
// 1. BAŞLANGIÇ (INIT)
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard Yüklendi ✅");
    initChart(); // Grafiği hazırla

    // Eğer token varsa direkt paneli aç
    if (authToken) {
        showDashboard();
    }

    // Slider Event Listener'ları
    document.getElementById('lossRange')?.addEventListener('input', (e) => updateLossVal(e.target.value));
    document.getElementById('jitterRange')?.addEventListener('input', (e) => updateJitterVal(e.target.value));
});

// ------------------------------------------------------------------
// 2. AUTH İŞLEMLERİ (LOGIN / REGISTER)
// ------------------------------------------------------------------
function toggleAuth(view) {
    document.getElementById('authError').classList.add('hidden');
    if (view === 'register') {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    } else {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPass').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('authToken', data.token);
            authToken = data.token;
            console.log("Giriş Başarılı");
            showDashboard();
        } else {
            showError(data.message);
        }
    } catch (e) {
        showError('Sunucuya erişilemiyor.');
    }
}

async function handleRegister() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (data.success) {
            alert('Kayıt başarılı! Giriş yapabilirsiniz.');
            toggleAuth('login');
        } else {
            showError(data.message);
        }
    } catch (e) {
        showError('Kayıt başarısız.');
    }
}

function logout() {
    localStorage.removeItem('authToken');
    if (socket) socket.disconnect();
    location.reload();
}

function showDashboard() {
    // UI Değişimi
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('currentUser').innerText = 'Admin';

    // 1. Socket Bağlantısını Kur
    connectSocket();

    // 2. Periyodik Veri Çekme (Node'lar ve Oturumlar)
    fetchNodes();
    fetchSessions();
    setInterval(() => {
        fetchNodes();
        fetchSessions();
    }, 2000); // 2 saniyede bir güncelle
}

function showError(msg) {
    const el = document.getElementById('authError');
    el.innerText = msg;
    el.classList.remove('hidden');
}

// ------------------------------------------------------------------
// 3. NODE YÖNETİMİ (FETCH / KILL / REVIVE)
// ------------------------------------------------------------------
async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${authToken}`;
    options.headers['Content-Type'] = 'application/json';
    return fetch(url, options);
}

async function fetchNodes() {
    try {
        const res = await fetchWithAuth('/api/admin/nodes');
        if (res.status === 401) { logout(); return; }

        const data = await res.json();

        // Tüm bilinenleri (ölüler dahil) hafızaya al
        const allKnown = data.allNodes || [];
        allKnown.forEach(id => KNOWN_NODES.add(id));

        updateNodeList(data.activeNodes, data.currentNode);
    } catch (e) {
        console.log("Node verisi alınamadı:", e);
    }
}

function updateNodeList(activeNodes, currentNode) {
    const list = document.getElementById('nodeList');
    list.innerHTML = '';
    activeNodeList = activeNodes;


    // Hafızadaki tüm node'ları listele
    KNOWN_NODES.forEach(nodeId => {
        const isActive = activeNodes.some(an => String(an) === String(nodeId));
        const isCurrent = String(nodeId) === String(currentNode);

        const li = document.createElement('li');
        li.className = 'flex justify-between items-center border-b border-gray-700 py-2';

        let statusHtml = isActive
            ? `<span class="text-green-400 font-bold text-xs">● ONLINE</span>`
            : `<span class="text-red-500 font-bold text-xs">💀 DEAD</span>`;

        let actionBtn = isActive
            ? `<button onclick="killNode('${nodeId}')" class="text-xs bg-red-900 hover:bg-red-700 text-red-200 px-3 py-1 rounded border border-red-700 transition">KILL</button>`
            : `<button onclick="reviveNode('${nodeId}')" class="text-xs bg-green-900 hover:bg-green-700 text-green-200 px-3 py-1 rounded border border-green-700 transition">REVIVE</button>`;

        li.innerHTML = `
            <div>
                <div class="font-mono ${isActive ? 'text-gray-200' : 'text-gray-500 line-through'}">${nodeId}</div>
                <div class="flex items-center gap-2 mt-1">
                    ${statusHtml}
                    ${isCurrent ? '<span class="text-[10px] bg-blue-900 text-blue-200 px-1 rounded">Gateway</span>' : ''}
                </div>
            </div>
            <div>${actionBtn}</div>
        `;
        list.appendChild(li);
    });
}

// Global Fonksiyonlar (HTML onclick için)
window.killNode = async function (nodeId) {
    if (!confirm(`${nodeId} durdurulacak. Emin misin?`)) return;
    try {
        await fetchWithAuth(`/api/admin/kill/${nodeId}`, { method: 'POST' });
        log(`💀 EMİR: ${nodeId} öldürülüyor...`);
        fetchNodes();
    } catch (e) { alert(e.message); }
};

window.reviveNode = async function (nodeId) {
    try {
        await fetchWithAuth(`/api/admin/revive/${nodeId}`, { method: 'POST' });
        log(`♻️ EMİR: ${nodeId} diriltiliyor...`);
        fetchNodes();
    } catch (e) { alert(e.message); }
};

// Eğer tüm sunucular ölürse çağrılır
function handleSystemCrash() {
    if (isSimulating) {
        stopSimulation();
        log("🚨 KRİTİK HATA: Tüm sunucular devre dışı! Yayın kesildi.");
        alert("TÜM SUNUCULAR ÇÖKTÜ! Yayın durduruldu.");
    }
    // Metrikleri Sıfırla
    updateDashboardUI({
        networkStats: { healthScore: 0 },
        qosPolicy: { action: 'SYSTEM_DOWN' }
    });
}

// ------------------------------------------------------------------
// 4. OTURUM (SESSION) YÖNETİMİ
// ------------------------------------------------------------------
async function fetchSessions() {
    try {
        const res = await fetchWithAuth('/api/sessions/active');
        const result = await res.json();

        if (result.success) {
            // Controller 'data' içinde gönderdiği için result.data kullanmalısın
            renderSessions(result.data || []);
        }
    } catch (e) { console.error(e); }
}

function renderSessions(sessions) {
    const listBody = document.getElementById('sessionListBody');
    listBody.innerHTML = '';

    // 1. Yayın ve Oturum Durum Kontrolü
    if (isSimulating && currentSessionId) {
        const mySession = sessions.find(s => s.sessionId === currentSessionId);

        if (mySession) {
            // Oturumun bağlı olduğu node yaşıyor mu? (none değilse ve aktif listedeyse)
            const isNodeAlive = mySession.nodeId !== 'none' && activeNodeList.includes(mySession.nodeId);

            if (!isNodeAlive) {
                // Sunucu yoksa simülasyonu DURDURMUYORUZ (Otomatik devralma için bekliyoruz)
                // Sadece log basıyoruz ve görsel uyarıyı flashBox ile veriyoruz
                console.warn(`⚠️ Bağlantı bekliyor: ${mySession.nodeId} sunucusu aktif değil.`);

                flashBox('boxVideo', 'dropped');
                flashBox('boxAudio', 'dropped');

                // Dashboard üzerindeki aksiyon metnini güncelle
                const statAction = document.getElementById('statAction');
                if (statAction) {
                    statAction.innerText = "RECONNECTING...";
                    statAction.className = "text-lg font-bold text-red-500 animate-pulse";
                }
            } else {
                // Sunucu geri geldiyse veya yaşıyorsa durumu normale çevir
                const statAction = document.getElementById('statAction');
                if (statAction && statAction.innerText === "RECONNECTING...") {
                    statAction.innerText = "ACTIVE";
                    statAction.className = "text-lg font-bold text-white";
                }
            }
        }
    }

    if (sessions.length === 0) {
        listBody.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-gray-500">Aktif oturum yok.</td></tr>';
        return;
    }

    sessions.forEach(sess => {
        const isJoined = currentSessionId === sess.sessionId;

        // 👇 YENİ KONTROL: Session'daki node, şu an aktif node listesinde var mı?
        // activeNodeList, fetchNodes() fonksiyonundan gelen global bir değişkendir.
        const isActiveNode = activeNodeList.includes(sess.nodeId);

        // Eğer node listede yoksa veya 'none' ise sahipsizdir/ölüdür.
        const isOrphaned = !isActiveNode || sess.nodeId === 'none' || sess.nodeId === 'unknown';

        const tr = document.createElement('tr');
        tr.className = isJoined ? 'bg-blue-900/30' : 'hover:bg-gray-700 transition';

        tr.innerHTML = `
            <td class="px-4 py-2 font-mono text-white">${sess.sessionId}</td>
            <td class="px-4 py-2 font-bold ${isOrphaned ? 'text-red-500 animate-pulse' : 'text-yellow-400'}">
                ${isOrphaned ? `⚠️ KOPUK (${sess.nodeId})` : sess.nodeId}
            </td>
            <td class="px-4 py-2">
                ${isJoined
                ? (isOrphaned
                    ? '<span class="text-red-600 font-bold animate-pulse text-xs">BAĞLANTI KESİLDİ</span>'
                    : '<span class="text-green-400 text-xs font-bold">BAĞLISIN</span>')
                : `<button onclick="joinSession('${sess.sessionId}')" class="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs">KATIL</button>`
            }
            </td>
            <td class="px-4 py-2 text-center">${sess.participantCount || 0}</td>
        `;
        listBody.appendChild(tr);
    });
}

window.createSession = async function () {
    const name = document.getElementById('newSessionName').value;
    if (!name) return alert("İsim giriniz!");

    try {

        const res = await fetchWithAuth('/api/sessions/init', {
            method: 'POST',
            body: JSON.stringify({ sessionId: name })
        });
        const data = await res.json();

        if (data.success) {
            // Oluşturunca otomatik katıl
            joinSession(name);
            document.getElementById('newSessionName').value = '';
        } else {
            alert("Hata: " + data.message);
        }
    } catch (e) { alert("Oturum oluşturulamadı"); }
};

// Oturuma Katıl (JOIN)
window.joinSession = async function (sessionId) {
    // 1. Önce Socket ile Odaya Gir
    if (!socket || !socket.connected) return alert("Socket bağlı değil!");
    socket.emit('join-session', sessionId);

    // 2. Backend'e Katıldığını Bildir (Opsiyonel ama iyi pratik)
    try {
        // Backend Endpoint: /api/sessions/:id/join (DÜZELTİLDİ)
        await fetchWithAuth(`/api/sessions/${sessionId}/join`, { method: 'POST' });
    } catch (e) { console.log("API Join hatası:", e); }

    currentSessionId = sessionId;

    // UI Güncelle
    const display = document.getElementById('currentSessionDisplay');
    display.innerText = `Oturum: ${sessionId}`;
    display.className = "text-xs bg-green-900 text-green-200 px-3 py-1 rounded border border-green-500";
    document.getElementById('leaveSessionControls').classList.remove('hidden');

    log(`Oturuma katılındı: ${sessionId}`);
    fetchSessions();
};

// Oturumdan Ayrıl (LEAVE)
window.leaveSession = async function () {
    if (!currentSessionId) return;

    try {
        // Backend Endpoint: /api/sessions/:id/leave (DÜZELTİLDİ)
        await fetchWithAuth(`/api/sessions/${currentSessionId}/leave`, { method: 'POST' });
    } catch (e) { console.log("API Leave hatası:", e); }

    stopSimulation(); // Yayını durdur
    const oldId = currentSessionId;
    currentSessionId = null;

    document.getElementById('currentSessionDisplay').innerText = "Oturum Yok";
    document.getElementById('currentSessionDisplay').className = "text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-600";
    document.getElementById('leaveSessionControls').classList.add('hidden');

    log(`Oturumdan ayrıldınız: ${oldId}`);
    fetchSessions();
};

// ------------------------------------------------------------------
// 5. SOCKET.IO BAĞLANTISI VE CANLI VERİ
// ------------------------------------------------------------------
function connectSocket() {
    if (socket && socket.connected) return;

    socket = io({
        auth: { token: authToken },
        reconnection: true,
        reconnectionAttempts: 10,       // 10 kere dene
        reconnectionDelay: 1000,

    });

    socket.on('connect', () => {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.innerText = '● CONNECTED';
        statusEl.className = 'text-green-500 font-bold';
        log('Sunucuya bağlanıldı.');

        if (wasStreamingBeforeDisconnect) {
            console.log("♻️ Bağlantı geri geldi! Yayın sürdürülüyor...");

            // Backend'e "Ben geri geldim, beni eski odama koy" de
            socket.emit('recover-session');

            // Veri akışını tekrar başlat
            startSimulation();

            // Hafızayı sıfırla
            wasStreamingBeforeDisconnect = false;
        }
    });

    socket.on('disconnect', () => {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.innerText = '● DISCONNECTED';
        statusEl.className = 'text-red-500 font-bold';
        log('Bağlantı koptu.');
        if (isSimulating) {
            wasStreamingBeforeDisconnect = true; // Hafızaya al
            stopSimulation(); // Interval'i temizle (Hata basmasın diye)

            // UI'da kullanıcıya bilgi ver
            const btn = document.getElementById('btnToggleSim');
            btn.innerText = '⌛ BAĞLANTI BEKLENİYOR...';
            btn.className = 'w-full bg-yellow-600 text-white font-bold py-2 px-4 rounded animate-pulse';
        }

        updateDashboardUI({
            networkStats: { healthScore: 0 },
            qosPolicy: { action: 'RECONNECTING...' }
        });
    });

    // Backend'den gelen 'net-pong' verisi (Health Score & QoS)
    socket.on('net-pong', (data) => {
        lastPongTime = Date.now();
        updateDashboardUI(data);
    });
}


// public/dashboard.js -> updateDashboardUI fonksiyonu

function updateDashboardUI(data) {
    const stats = data.networkStats || {};
    const qos = data.qosPolicy || {};

    // --- 1. SKOR VE BAR GÜNCELLEMELERİ (Aynı kalacak) ---
    const score = stats.healthScore || 0;
    document.getElementById('scoreDisplay').innerText = score;
    const bar = document.getElementById('scoreBar');
    bar.style.width = `${score}%`;

    // Bar Rengi
    if (score > 70) bar.className = 'bg-green-500 h-2.5 rounded-full transition-all duration-500';
    else if (score > 40) bar.className = 'bg-yellow-500 h-2.5 rounded-full transition-all duration-500';
    else bar.className = 'bg-red-500 h-2.5 rounded-full transition-all duration-500';

    // QoS Action Yazısı
    document.getElementById('statAction').innerText = qos.action || 'NONE';

    // --- 2. KUTU IŞIKLARI (SÜREKLİ YANIP/SÖNME MANTIĞI) ---
    const boxAudio = document.getElementById('boxAudio');
    const boxVideo = document.getElementById('boxVideo');

    // Varsayılan Durum: Sönük (Disabled)
    let audioClass = 'disabled';
    let videoClass = 'disabled';

    // Eğer sistemde hayat varsa (Skor > 0) mantığı çalıştır
    if (score > 0) {
        // SES: Ses her zaman en yüksek önceliklidir ve hep açık kalır (Active)
        audioClass = 'active-audio';

        // VIDEO: QoS kararına göre video açık mı kapalı mı?
        // Eğer karar 'DROP_VIDEO' veya 'AUDIO_ONLY' ise videoyu söndür.
        if (qos.action === 'DROP_VIDEO' || qos.action === 'AUDIO_ONLY') {
            videoClass = 'disabled'; // Video Kapatıldı (Gri)
        } else {
            videoClass = 'active-video'; // Video Açık (Mavi) - (MAINTAIN veya LOWER_QUALITY)
        }
    }

    // Sınıfları ata (Yanıp sönme yok, kalıcı değişim)
    boxAudio.className = `status-box ${audioClass} transition-all duration-300`;
    boxVideo.className = `status-box ${videoClass} transition-all duration-300`;

    // --- 3. GRAFİK GÜNCELLEME (Aynı kalacak) ---
    if (qosChart) {
        const d = qosChart.data.datasets[0].data;
        d.push(score);
        d.shift();
        qosChart.update();
    }
}

// ------------------------------------------------------------------
// 6. SİMÜLASYON MANTIĞI (Traffic Generator)
// ------------------------------------------------------------------
function updateLossVal(v) { simParams.lossProb = v; document.getElementById('lossValue').innerText = v; }
function updateJitterVal(v) { simParams.jitter = v; document.getElementById('jitterValue').innerText = v; }

function toggleSimulation() {
    if (isSimulating) stopSimulation();
    else startSimulation();
}

// dashboard.js

let firstResponseReceived = false; // Sunucudan ilk cevabı beklemek için

function startSimulation() {
    if (!currentSessionId) {
        alert("⚠️ Yayını başlatmak için listeden bir oturuma KATILMALISINIZ!");
        return;
    }

    // Durumu sıfırla
    isSimulating = true;
    firstResponseReceived = false;
    lastPongTime = Date.now();

    const btn = document.getElementById('btnToggleSim');
    btn.innerText = '⏹ YAYINI DURDUR';
    btn.className = 'w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition shadow-lg shadow-red-900/50';

    if (simulationInterval) clearInterval(simulationInterval);

    simulationInterval = setInterval(() => {
        if (!isSimulating) return;

        // Her saniye PING gönder
        socket.emit('net-ping', {
            sessionId: currentSessionId,
            timestamp: Date.now(),
            seqNum: ++seqNum, // Sıra numarasını artırarak gönder
            simulated: {
                packetLoss: parseInt(simParams.lossProb) || 0,
                jitter: parseInt(simParams.jitter) || 0
            }
        });

        // EĞER İLK CEVAP GELDİYSE TIMEOUT KONTROLÜ YAP
        if (firstResponseReceived) {
            const timeSinceLastPacket = Date.now() - lastPongTime;

            if (timeSinceLastPacket > TIMEOUT_MS) {
                console.error("🚨 CONNECTION TIMEOUT!");
                stopSimulation();
                alert("BAĞLANTI HATASI: Sunucu yanıt vermiyor.");
                firstResponseReceived = false;
            }
        } else {
            // Sunucunun ilk cevabı vermesi için 10 saniyelik bir tolerans tanı
            const waitingTime = Date.now() - lastPongTime;
            if (waitingTime > 10000) {
                stopSimulation();
                alert("SUNUCUYA BAĞLANILAMADI: Sunucu hazır değil.");
            }
        }
    }, 1000);
}

socket.on('net-pong', (data) => {
    // 1. Zamanlayıcıyı güncelle (Hata almaman için kritik)
    lastPongTime = Date.now();
    firstResponseReceived = true;

    // 2. Dashboard metinlerini güncelle
    updateDashboardUI(data);

    // 3. GRAFİKLERİ GÜNCELLE
    // Eğer grafik fonksiyonun farklı bir isimdeyse (örn: updateCharts) onu çağır
    if (typeof updateCharts === 'function' && data.metrics) {
        updateCharts(data.metrics);
    }

    // Konsolda verinin geldiğini doğrula
    console.log("📊 Metrik verisi alındı:", data.metrics);
});

function stopSimulation() {
    isSimulating = false;
    clearInterval(simulationInterval);
    const btn = document.getElementById('btnToggleSim');
    btn.innerText = '▶ YAYINI BAŞLAT';
    btn.className = 'w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition shadow-lg shadow-green-900/50';
}

// ------------------------------------------------------------------
// 7. YARDIMCI FONKSİYONLAR & CHART SETUP
// ------------------------------------------------------------------
function log(msg) {
    const w = document.getElementById('decisionLog');
    if (!w) return;
    const d = document.createElement('div');
    d.className = "text-gray-400 border-b border-gray-800 pb-1 mb-1";
    d.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    w.prepend(d);
    if (w.children.length > 20) w.removeChild(w.lastChild);
}

function flashBox(id, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `status-box ${cls} transition-all duration-200`;
    setTimeout(() => el.className = 'status-box disabled', 200);
}

function initChart() {
    const canvas = document.getElementById('qosChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    qosChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(20).fill(''),
            datasets: [{
                label: 'Health Score',
                data: Array(20).fill(0),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 100, grid: { color: '#333' } },
                x: { display: false }
            }
        }
    });
}