// --- AYARLAR ---
const socket = io();

let simulationInterval = null;
let isSimulating = false;
let seqNum = 0;
let activeNodeCount = 0; // Aktif node sayısını takip et

let simParams = {
    lossProb: 0,
    jitter: 0
};

// --- NODE YÖNETİMİ & CHAOS MONKEY ---

setInterval(fetchNodes, 1000);

async function fetchNodes() {
    try {
        const res = await fetch('/api/admin/nodes');
        const data = await res.json();
        activeNodeCount = data.activeNodes.length;
        updateNodeList(data.activeNodes, data.currentNode);
        document.getElementById('connectedNodeId').innerText = data.currentNode;
    } catch (e) {
        console.log("Node bilgisi çekilemedi.");
        activeNodeCount = 0;
    }
}

function updateNodeList(activeNodes, currentNode) {
    const list = document.getElementById('nodeList');
    list.innerHTML = '';

    const knownNodes = [
        { name: 'node-primary', port: 3000 },
        { name: 'node-backup', port: 3001 }
    ];

    knownNodes.forEach(node => {
        const isActive = activeNodes.includes(node.name);
        const isCurrent = node.name === currentNode;

        let statusHtml = isActive
            ? '<span class="node-active">● ON</span>'
            : '<span class="node-dead">❌ DEAD</span>';

        if (isCurrent && isActive) {
            statusHtml += ' <span class="text-xs text-blue-400 ml-2">(You)</span>';
        }

        const actionBtn = isActive
            ? `<button onclick="killNode(${node.port})" class="text-xs bg-red-900 hover:bg-red-700 text-red-200 px-2 py-0.5 rounded ml-2">KILL</button>`
            : `<button onclick="reviveNode(${node.port})" class="text-xs bg-green-900 hover:bg-green-700 text-green-200 px-2 py-0.5 rounded ml-2">REVIVE</button>`;

        const li = document.createElement('li');
        li.className = 'flex justify-between items-center border-b border-gray-700 py-2';

        const nameClass = isActive ? 'text-gray-300' : 'text-gray-600 line-through';

        li.innerHTML = `
            <div>
                <span class="${nameClass}">${node.name}</span> 
                ${statusHtml}
            </div>
            <div>${actionBtn}</div>
        `;
        list.appendChild(li);
    });
}

async function killNode(port) {
    try {
        const res = await fetch(`http://localhost:${port}/api/admin/kill`, { method: 'POST' });
        const data = await res.json();
        log(`💀 KOMUT: ${data.message}`);
        setTimeout(fetchNodes, 500);
    } catch (e) {
        log(`❌ Hata: ${port} portuna ulaşılamadı.`);
    }
}

async function reviveNode(port) {
    try {
        const res = await fetch(`http://localhost:${port}/api/admin/revive`, { method: 'POST' });
        const data = await res.json();
        log(`♻️ KOMUT: ${data.message}`);
        setTimeout(fetchNodes, 500);
    } catch (e) {
        log(`❌ Hata: ${port} diriltilemedi.`);
    }
}

// --- GRAFİK KURULUMU (Chart.js) ---
const ctx = document.getElementById('qosChart').getContext('2d');
const qosChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(20).fill(''),
        datasets: [{
            label: 'Health Score',
            // DÜZELTME: Başlangıçta 0 (Veri akışı yok)
            data: Array(20).fill(0),
            borderColor: '#22c55e',
            tension: 0.4,
            fill: false
        }, {
            label: 'Packet Loss (%)',
            // DÜZELTME: Başlangıçta 0
            data: Array(20).fill(0),
            borderColor: '#ef4444',
            tension: 0.1,
            fill: false
        }]
    },
    options: {
        responsive: true,
        animation: false,
        scales: { y: { min: 0, max: 100, grid: { color: '#334155' } } },
        plugins: { legend: { labels: { color: '#94a3b8' } } }
    }
});

// --- SOCKET.IO EVENTLERİ ---
socket.on('connect', () => {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.innerText = '● CONNECTED';
    statusEl.className = 'text-green-500 font-bold';
    log('System connected to server.');
});

socket.on('disconnect', () => {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.innerText = '● DISCONNECTED';
    statusEl.className = 'text-red-500 font-bold';
    stopSimulationUI();
});

socket.on('net-pong', (data) => {
    if (activeNodeCount === 0) {
        data.networkStats.healthScore = 0;
        data.networkStats.packetLoss = 100;
        data.qosPolicy = { status: 'CRITICAL', action: 'SYSTEM_DOWN', reason: 'No active nodes' };
    }
    updateDashboard(data);
});

// --- SİMÜLASYON FONKSİYONLARI ---
function toggleSimulation() {
    if (isSimulating) stopSimulation();
    else startSimulation();
}

function startSimulation() {
    if (activeNodeCount === 0) {
        log("❌ HATA: Hiçbir sunucu aktif değil! Simülasyon başlatılamaz.");
        return;
    }

    isSimulating = true;
    const btn = document.getElementById('btnToggleSim');
    btn.innerText = '⏹ DURDUR';
    btn.className = 'w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition';

    simulationInterval = setInterval(() => {
        if (activeNodeCount === 0) {
            updateDashboard({
                networkStats: { healthScore: 0, packetLoss: 100, jitter: 0 },
                qosPolicy: { status: 'CRITICAL', action: 'SYSTEM_DOWN', reason: 'All nodes dead' }
            });
            return;
        }

        seqNum++;

        if (Math.random() * 100 < simParams.lossProb) {
            flashBox('boxVideo', 'dropped');
            flashBox('boxAudio', 'dropped');
            return;
        }

        const delay = Math.random() * simParams.jitter;
        setTimeout(() => {
            socket.emit('net-ping', { timestamp: Date.now(), seqNum: seqNum });
            flashBox('boxAudio', 'active-audio');

            const currentAction = document.getElementById('statAction').innerText;
            if (currentAction !== 'DROP_VIDEO' && currentAction !== 'SYSTEM_DOWN') {
                flashBox('boxVideo', 'active-video');
            } else {
                const vidBox = document.getElementById('boxVideo');
                vidBox.className = 'status-box disabled';
                vidBox.innerText = currentAction === 'SYSTEM_DOWN' ? 'SYSTEM DOWN' : 'VIDEO BLOCKED';
            }
        }, delay);
    }, 100);
}

function stopSimulation() {
    isSimulating = false;
    clearInterval(simulationInterval);
    stopSimulationUI();
}

function stopSimulationUI() {
    const btn = document.getElementById('btnToggleSim');
    btn.innerText = '▶ BAŞLAT';
    btn.className = 'w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition';
    document.getElementById('boxAudio').className = 'status-box disabled';
    const vidBox = document.getElementById('boxVideo');
    vidBox.className = 'status-box disabled';
    vidBox.innerText = 'VIDEO STREAM';

    // --- UI SIFIRLAMA (RESET) ---
    document.getElementById('scoreDisplay').innerText = '0';
    document.getElementById('scoreBar').style.width = '0%';
    document.getElementById('scoreBar').className = 'h-2.5 rounded-full bg-gray-600'; // Rengi gri yap
    document.getElementById('statJitter').innerText = '0.0ms';
    document.getElementById('statLoss').innerText = '0%';
    document.getElementById('statAction').innerText = 'IDLE';
    document.getElementById('statAction').className = 'text-lg font-bold text-white';

    // Grafiği Sıfırla
    qosChart.data.datasets[0].data = Array(20).fill(0);
    qosChart.data.datasets[1].data = Array(20).fill(0);
    qosChart.update();
}

function updateDashboard(data) {
    const stats = data.networkStats;
    const qos = data.qosPolicy;

    document.getElementById('statJitter').innerText = (stats.jitter || 0).toFixed(1) + 'ms';
    document.getElementById('statLoss').innerText = stats.packetLoss ? stats.packetLoss.toFixed(1) + '%' : '0%';
    document.getElementById('scoreDisplay').innerText = stats.healthScore;
    document.getElementById('scoreBar').style.width = stats.healthScore + '%';

    const scoreBar = document.getElementById('scoreBar');
    if (stats.healthScore > 80) scoreBar.className = 'h-2.5 rounded-full bg-green-500';
    else if (stats.healthScore > 50) scoreBar.className = 'h-2.5 rounded-full bg-yellow-500';
    else scoreBar.className = 'h-2.5 rounded-full bg-red-500';

    const actionDiv = document.getElementById('statAction');
    actionDiv.innerText = qos.action;

    if (qos.status === 'CRITICAL') actionDiv.className = 'text-lg font-bold text-red-500 blink';
    else if (qos.status === 'WARNING') actionDiv.className = 'text-lg font-bold text-yellow-500';
    else actionDiv.className = 'text-lg font-bold text-green-500';

    updateChart(stats.healthScore, stats.packetLoss || 0);

    if (qos.status !== 'STABLE') {
        // log(`Status: ${qos.status} | Action: ${qos.action}`);
    }
}

function updateChart(score, loss) {
    const dataScore = qosChart.data.datasets[0].data;
    const dataLoss = qosChart.data.datasets[1].data;
    dataScore.push(score); dataScore.shift();
    dataLoss.push(loss); dataLoss.shift();
    qosChart.update();
}

function updateLossVal(val) { simParams.lossProb = val; document.getElementById('lossValue').innerText = val; }
function updateJitterVal(val) { simParams.jitter = val; document.getElementById('jitterValue').innerText = val; }

function flashBox(id, activeClass) {
    const el = document.getElementById(id);
    if (id === 'boxVideo' && el.innerText.includes('BLOCKED')) return;
    el.className = `status-box ${activeClass}`;
    el.innerText = id === 'boxAudio' ? 'AUDIO' : 'VIDEO';
    setTimeout(() => {
        if (el.innerText.includes('BLOCKED') || el.innerText.includes('SYSTEM DOWN')) return;
        el.className = 'status-box disabled';
    }, 80);
}

function log(msg) {
    const logWin = document.getElementById('decisionLog');
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.innerText = `[${time}] ${msg}`;
    logWin.prepend(div);
    if (logWin.children.length > 50) logWin.lastChild.remove();
}