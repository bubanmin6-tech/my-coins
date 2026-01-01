const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let currentPrice = 100;
let candles = []; 
let db = {}; 
let cOpen = 100, cHigh = 100, cLow = 100;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// 0.5초마다 모든 데이터 전송 (완벽 동기화 + 0.5초 변동)
setInterval(() => {
    const r = Math.random() * 100;
    let change = (r < 45) ? 10 : (r < 90 ? -10 : 0); // 민민 님 확률 45:45:10
    currentPrice += change;
    if (currentPrice < 10) currentPrice = 10;
    
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;

    candles.push({ open: cOpen, high: cHigh, low: cLow, close: currentPrice });
    if (candles.length > 50) candles.shift();

    let ranking = Object.values(db).map(u => ({ 
        id: u.id, 
        total: u.cash + (u.coin * currentPrice) 
    })).sort((a, b) => b.total - a.total).slice(0, 5);

    io.emit('tick', { 
        price: currentPrice, 
        candles: candles, 
        ranking: ranking 
    });

    cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
}, 500);

// 관리자 명령어
rl.on('line', (input) => {
    const args = input.split(' ');
    if (args[0] === 'set' && db[args[1]]) {
        db[args[1]].cash = Number(args[2]);
        io.emit('updateUI', db[args[1]]);
    } else if (args[0] === 'notice') {
        io.emit('adminNotice', input.replace('notice ', ''));
    } else if (args[0] === 'reset_all') {
        db = {};
        console.log("⚠️ 모든 데이터 초기화 완료.");
    }
});

io.on('connection', (socket) => {
    socket.on('join', (id) => {
        let uid = id || socket.id.substring(0, 5);
        if (!db[uid]) db[uid] = { id: uid, cash: 500, coin: 0 };
        socket.userId = uid;
        socket.emit('init', db[uid]);
    });

    socket.on('requestCharge', () => {
        const uid = socket.userId;
        console.log(`\n[충전요청] ${uid} 승인(y/n): `);
        const handle = (i) => {
            if (i === 'y' && db[uid]) { 
                db[uid].cash += 1000; 
                socket.emit('updateUI', db[uid]); 
                socket.emit('log', '✅ 1,000원 충전 완료'); 
            }
            rl.off('line', handle);
        };
        rl.on('line', handle);
    });

    socket.on('buy', (q) => {
        let u = db[socket.userId]; let cost = currentPrice * Number(q);
        if (u && u.cash >= cost && q > 0) { 
            u.cash -= cost; u.coin += Number(q); 
            socket.emit('updateUI', u); 
            io.emit('log', `[매수] ${u.id}님 ${q}개`); 
        }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId]; 
        if (u && u.coin >= Number(q) && q > 0) { 
            u.cash += currentPrice * Number(q); u.coin -= Number(q); 
            socket.emit('updateUI', u); 
            io.emit('log', `[매도] ${u.id}님 ${q}개`); 
        }
    });

    socket.on('sendCoin', (data) => {
        let me = db[socket.userId]; let friend = db[data.to]; let amt = Number(data.amount);
        if (me && friend && me.coin >= amt && amt > 0) {
            me.coin -= amt; friend.coin += amt;
            socket.emit('updateUI', me); 
            io.emit('log', `[송금] ${me.id} -> ${friend.id} ${amt}개`);
        }
    });
});

// 서버용 포트 설정 적용
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 서버가 ${PORT}번 포트에서 가동 중!`));