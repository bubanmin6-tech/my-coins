const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let currentPrice = 100;
let candles = [];
let db = {};
let pendingRequests = [];
let cOpen = 100, cHigh = 100, cLow = 100;
let lastTime = Math.floor(Date.now() / 1000);

function initCandles() {
    candles = [];
    let start = lastTime - 250;
    for(let i=0; i<50; i++) {
        candles.push({ time: start + (i * 5), open: 100, high: 100, low: 100, close: 100 });
    }
}
initCandles();

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

setInterval(() => {
    const drift = Math.floor(Math.random() * 3) + 1;
    if (Math.random() < 0.5) currentPrice += drift; else currentPrice -= drift;
    if (currentPrice < 1) currentPrice = 1;
    
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;

    let ranking = Object.values(db).map(u => ({
        id: u.id,
        total: Math.floor((u.cash || 0) + ((u.coin || 0) * currentPrice))
    })).sort((a, b) => b.total - a.total).slice(0, 5);

    io.emit('tick', { price: currentPrice, ranking: ranking });
}, 2000);

setInterval(() => {
    lastTime += 5;
    const candle = { time: lastTime, open: cOpen, high: cHigh, low: cLow, close: currentPrice };
    candles.push(candle);
    if (candles.length > 50) candles.shift();
    cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
    io.emit('candleUpdate', candles);
}, 5000);

io.on('connection', (socket) => {
    socket.on('join', (id) => {
        let uid = id || "user_" + Math.floor(Math.random()*1000);
        if (!db[uid]) db[uid] = { id: uid, cash: 1000, coin: 0 };
        socket.userId = uid;
        socket.emit('init', db[uid]);
        socket.emit('candleUpdate', candles);
    });

    socket.on('chat', (msg) => {
        if(msg && msg.length < 50) {
            io.emit('chat', { id: socket.userId, msg: msg });
        }
    });

    socket.on('requestCharge', () => {
        if (!pendingRequests.find(r => r.id === socket.userId)) {
            pendingRequests.push({ id: socket.userId, amount: 500 });
            io.emit('admin_updateRequests', pendingRequests);
        }
    });

    socket.on('admin_approve', (uid) => {
        if (db[uid]) {
            db[uid].cash += 500;
            pendingRequests = pendingRequests.filter(r => r.id !== uid);
            io.emit('admin_updateRequests', pendingRequests);
            io.emit('updateUI_specific', { userId: uid, data: db[uid] });
        }
    });

    socket.on('buy', (q) => {
        let u = db[socket.userId]; let cost = currentPrice * Number(q);
        if (u && u.cash >= cost) { u.cash -= cost; u.coin += Number(q); socket.emit('updateUI', u); }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId]; if (u && u.coin >= Number(q)) { u.cash += currentPrice * Number(q); u.coin -= Number(q); socket.emit('updateUI', u); }
    });

    socket.on('admin_getRequests', () => socket.emit('admin_updateRequests', pendingRequests));
});

server.listen(3000, '0.0.0.0');
