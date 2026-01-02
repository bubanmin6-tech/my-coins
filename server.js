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

function initCandles() {
    candles = [];
    const now = Math.floor(Date.now() / 1000);
    for(let i=0; i<40; i++) {
        // 차트가 깨지지 않게 5초 간격으로 과거 데이터 생성
        candles.push({ 
            time: now - (40 - i) * 5, 
            open: 100, high: 100, low: 100, close: 100 
        });
    }
}
initCandles();

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

setInterval(() => {
    const r = Math.random() * 100;
    const drift = Math.floor(Math.random() * 10) + 2;
    
    // 50:50 확률
    if (r < 50) currentPrice += drift;
    else currentPrice -= drift;
    
    if (currentPrice < 10) currentPrice = 10;
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;

    io.emit('priceUpdate', { price: currentPrice, high: cHigh, low: cLow });
}, 1000);

setInterval(() => {
    const candle = { 
        time: Math.floor(Date.now() / 1000), // 정확한 현재 시간(초)
        open: cOpen, high: cHigh, low: cLow, close: currentPrice 
    };
    candles.push(candle);
    if (candles.length > 200) candles.shift();
    
    cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
    io.emit('candleUpdate', candles);
    sendRanking();
}, 5000);

function sendRanking() {
    let ranking = Object.values(db).map(u => ({
        id: u.id, total: u.cash + (u.coin * currentPrice)
    })).sort((a, b) => b.total - a.total).slice(0, 5);
    io.emit('updateRanking', ranking);
}

io.on('connection', (socket) => {
    socket.on('join', (id) => {
        let uid = id || socket.id.substring(0, 5);
        if (!db[uid]) db[uid] = { id: uid, cash: 500, coin: 0 };
        socket.userId = uid;
        socket.emit('init', db[uid]);
        socket.emit('candleUpdate', candles); 
    });

    socket.on('buy', (q) => {
        let u = db[socket.userId]; let cost = currentPrice * Number(q);
        if (u && u.cash >= cost) { 
            u.cash -= cost; u.coin += Number(q); 
            socket.emit('updateUI', u); 
            sendRanking();
        }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId];
        if (u && u.coin >= Number(q)) { 
            u.cash += currentPrice * Number(q); u.coin -= Number(q); 
            socket.emit('updateUI', u); 
            sendRanking();
        }
    });
    
    // 송금 및 관리자 명령 로직 생략 (기존과 동일)
});

server.listen(PORT, () => console.log(`🚀 서버 실행 중`));
