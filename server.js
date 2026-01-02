const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- 데이터 및 변수 설정 ---
let currentPrice = 100; 
let candles = []; 
let db = {}; 
let cOpen = 100, cHigh = 100, cLow = 100;

function initCandles() {
    candles = [];
    for(let i=0; i<40; i++) {
        candles.push({ open: 100, high: 100, low: 100, close: 100 });
    }
}
initCandles();

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- 1. 실시간 가격 변동 로직 ---
setInterval(() => {
    const r = Math.random() * 100;
    const drift = Math.floor(Math.random() * 10) + 2;
    let change = (r < 45) ? drift : (r < 95 ? -drift : 0);
    
    currentPrice += change;
    if (currentPrice < 10) currentPrice = 10;
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;

    io.emit('priceUpdate', { price: currentPrice, high: cHigh, low: cLow });
    sendRanking(); // 가격 변동 시 랭킹도 업데이트
}, 1000);

// --- 2. 5초마다 캔들 확정 ---
setInterval(() => {
    const candle = { open: cOpen, high: cHigh, low: cLow, close: currentPrice };
    candles.push(candle);
    if (candles.length > 40) candles.shift();
    cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
    io.emit('candleUpdate', candles);
}, 5000);

// --- 3. 실시간 랭킹 계산 함수 (상위 5명) ---
function sendRanking() {
    let ranking = Object.values(db).map(u => {
        return { id: u.id, total: u.cash + (u.coin * currentPrice) };
    });
    ranking.sort((a, b) => b.total - a.total);
    io.emit('updateRanking', ranking.slice(0, 5));
}

io.on('connection', (socket) => {
    // 유저 접속 (초기 자금 500원)
    socket.on('join', (id) => {
        let uid = id || socket.id.substring(0, 5);
        if (!db[uid]) db[uid] = { id: uid, cash: 500, coin: 0 };
        socket.userId = uid;
        socket.emit('init', db[uid]);
        sendRanking();
    });

    // 💸 코인 송금 기능
    socket.on('sendCoin', (data) => {
        const { toId, amount } = data;
        let me = db[socket.userId];
        let target = db[toId];
        let amt = Number(amount);

        if (me && target && me.coin >= amt && amt > 0) {
            me.coin -= amt;
            target.coin += amt;
            socket.emit('updateUI', me);
            io.emit('updateUI_specific', { userId: toId, data: target });
            socket.emit('system_msg', `${toId}님에게 코인 ${amt}개를 보냈습니다.`);
        } else {
            socket.emit('system_msg', `송금 실패 (잔액 부족 또는 대상 없음)`);
        }
    });

    // 🔌 충전 신청
    socket.on('requestCharge', () => {
        io.emit('request_recharge_to_admin', { userId: socket.userId });
    });

    // 🛠️ 관리자 명령어 (admin.html과 연결)
    socket.on('admin_command', (data) => {
        switch(data.type) {
            case 'RECHARGE_Y':
                if(db[data.userId]) {
                    db[data.userId].cash += 500;
                    io.emit('updateUI_specific', { userId: data.userId, data: db[data.userId] });
                }
                break;
            case 'NOTICE':
                io.emit('adminNotice', data.value);
                break;
            case 'SET_ASSET':
                if(db[data.userId]) {
                    db[data.userId].cash = Number(data.value);
                    io.emit('updateUI_specific', { userId: data.userId, data: db[data.userId] });
                }
                break;
            case 'RESET_ALL':
                db = {}; 
                currentPrice = 100;
                cOpen = 100; cHigh = 100; cLow = 100;
                initCandles();
                io.emit('force_reload');
                break;
        }
    });

    // 매수/매도
    socket.on('buy', (q) => {
        let u = db[socket.userId]; let cost = currentPrice * Number(q);
        if (u && u.cash >= cost && q > 0) { 
            u.cash -= cost; u.coin += Number(q); 
            socket.emit('updateUI', u); 
            sendRanking();
        }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId];
        if (u && u.coin >= Number(q) && q > 0) { 
            u.cash += currentPrice * Number(q); u.coin -= Number(q); 
            socket.emit('updateUI', u); 
            sendRanking();
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
