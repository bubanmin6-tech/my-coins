const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
let currentPrice = 100; 
let candles = []; 
let db = {}; 
let cOpen = 100, cHigh = 100, cLow = 100;

// 초기 차트 데이터 생성 함수
function initCandles() {
    candles = [];
    for(let i=0; i<40; i++) {
        candles.push({ open: 100, high: 100, low: 100, close: 100 });
    }
}
initCandles();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// 가격 변동 로직
setInterval(() => {
    const r = Math.random() * 100;
    const drift = Math.floor(Math.random() * 10) + 2;
    let change = (r < 45) ? drift : (r < 95 ? -drift : 0);
    currentPrice += change;
    if (currentPrice < 10) currentPrice = 10;
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;
    io.emit('priceUpdate', { price: currentPrice, high: cHigh, low: cLow });
}, 1000);

setInterval(() => {
    const candle = { open: cOpen, high: cHigh, low: cLow, close: currentPrice };
    candles.push(candle);
    if (candles.length > 40) candles.shift();
    cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
    io.emit('candleUpdate', candles);
}, 5000);

io.on('connection', (socket) => {
    socket.on('join', (id) => {
        let uid = id || socket.id.substring(0, 5);
        if (!db[uid]) db[uid] = { id: uid, cash: 500, coin: 0 };
        socket.userId = uid;
        socket.emit('init', db[uid]);
    });

    // 🔌 유저가 충전 버튼 눌렀을 때 (관리자에게 신호 보냄)
    socket.on('requestCharge', () => {
        io.emit('request_recharge_to_admin', { userId: socket.userId });
    });

    // 🛠️ 관리자 명령어 처리
    socket.on('admin_command', (data) => {
        switch(data.type) {
            case 'RECHARGE_Y': // 승인
                if(db[data.userId]) {
                    db[data.userId].cash += 500;
                    io.emit('updateUI_specific', { userId: data.userId, data: db[data.userId] });
                }
                break;
            case 'NOTICE': // 공지
                io.emit('adminNotice', data.value);
                break;
            case 'RESET_ALL': // ✨ 민님이 말한 3가지 초기화
                db = {}; // 1. 모든 사람 돈/코인 삭제
                currentPrice = 100; // 2. 현재 가격 100원 복구
                cOpen = 100; cHigh = 100; cLow = 100;
                initCandles(); // 차트 초기화
                io.emit('priceUpdate', { price: 100, high: 100, low: 100 });
                io.emit('force_reload'); // 3. 유저 화면 새로고침 (기록 삭제 효과)
                break;
        }
    });

    socket.on('buy', (q) => { /* 기존 매수 로직 */ });
    socket.on('sell', (q) => { /* 기존 매도 로직 */ });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
