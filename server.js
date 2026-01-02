const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 환경 설정 ---
const PORT = process.env.PORT || 3000;
let currentPrice = 100; 
let candles = []; 
let db = {}; 
let cOpen = 100, cHigh = 100, cLow = 100;

// 초기 차트 데이터 생성
for(let i=0; i<40; i++) {
    candles.push({ open: 100, high: 100, low: 100, close: 100 });
}

// --- 라우팅 ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
// 관리자 페이지 접속 경로 추가
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- 코인 로직 (기존 유지) ---
setInterval(() => {
    const r = Math.random() * 100;
    const drift = Math.floor(Math.random() * 10) + 2;
    let change = 0;
    if (r < 45) change = drift;
    else if (r < 95) change = -drift;
    
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

// --- 소켓 통신 및 관리자 명령어 처리 ---
io.on('connection', (socket) => {
    // 유저 접속
    socket.on('join', (id) => {
        let uid = id || socket.id.substring(0, 5);
        if (!db[uid]) db[uid] = { id: uid, cash: 500, coin: 0 };
        socket.userId = uid;
        socket.emit('init', db[uid]);
    });

    // 충전 요청 (유저가 보냄)
    socket.on('requestCharge', () => {
        const uid = socket.userId;
        console.log(`[충전요청] ${uid}`);
        // 관리자에게 알림 전송
        io.emit('request_recharge_to_admin', { userId: uid });
    });

    // 관리자 명령어 처리 (admin.html에서 보냄)
    socket.on('admin_command', (data) => {
        switch(data.type) {
            case 'RECHARGE_Y': // 기존 y 승인 기능
                if(db[data.userId]) {
                    db[data.userId].cash += 500;
                    // 해당 유저에게만 업데이트 알림
                    io.emit('updateUI_specific', { userId: data.userId, data: db[data.userId] });
                    console.log(`[승인] ${data.userId} 500원 충전 완료`);
                }
                break;
                
            case 'NOTICE': // 기존 notice [내용] 기능
                io.emit('adminNotice', data.value);
                console.log(`[공지] ${data.value}`);
                break;
                
            case 'SET_ASSET': // 기존 set [아이디] [금액] 기능
                if(db[data.userId]) {
                    db[data.userId].cash = Number(data.value);
                    io.emit('updateUI_specific', { userId: data.userId, data: db[data.userId] });
                    console.log(`[수정] ${data.userId} 자산 ${data.value}원으로 변경`);
                }
                break;
                
            case 'RESET_ALL': // 기존 reset_all 기능
                db = {}; 
                io.emit('force_reload');
                console.log('서버 데이터 전체 초기화 완료');
                break;
        }
    });

    // 매수/매도 로직 (기존 유지)
    socket.on('buy', (q) => {
        let u = db[socket.userId]; let cost = currentPrice * Number(q);
        if (u && u.cash >= cost && q > 0) { u.cash -= cost; u.coin += Number(q); socket.emit('updateUI', u); }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId];
        if (u && u.coin >= Number(q) && q > 0) { u.cash += currentPrice * Number(q); u.coin -= Number(q); socket.emit('updateUI', u); }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
