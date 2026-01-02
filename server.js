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
    let start = lastTime - 500;
    for(let i=0; i<100; i++) {
        candles.push({ time: start + (i * 5), open: 100, high: 100, low: 100, close: 100 });
    }
    lastTime = candles[candles.length - 1].time;
}
initCandles();

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

setInterval(() => {
    const r = Math.random() * 100;
    const drift = Math.floor(Math.random() * 5) + 1;
    if (r < 50) currentPrice += drift;
    else currentPrice -= drift;
    if (currentPrice < 1) currentPrice = 1;
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;

    let ranking = Object.values(db).map(u => ({
        id: u.id,
        total: Math.floor((Number(u.cash) || 0) + ((Number(u.coin) || 0) * currentPrice))
    })).sort((a, b) => b.total - a.total).slice(0, 10);

    io.emit('tick', { price: currentPrice, ranking: ranking });
}, 1000);

setInterval(() => {
    lastTime += 5;
    const candle = { time: lastTime, open: cOpen, high: cHigh, low: cLow, close: currentPrice };
    candles.push(candle);
    if (candles.length > 200) candles.shift();
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

    socket.on('buy', (q) => {
        let u = db[socket.userId];
        let numQ = Number(q);
        let cost = currentPrice * numQ;
        if (u && u.cash >= cost) {
            u.cash -= cost; u.coin += numQ;
            socket.emit('updateUI', u);
        }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId];
        let numQ = Number(q);
        if (u && u.coin >= numQ) {
            u.cash += currentPrice * numQ; u.coin -= numQ;
            socket.emit('updateUI', u);
        }
    });

    socket.on('requestCharge', () => {
        if (!pendingRequests.find(r => r.id === socket.userId)) {
            pendingRequests.push({ id: socket.userId });
            io.emit('admin_updateRequests', pendingRequests);
        }
    });

    socket.on('sendCoin', (d) => {
        let me = db[socket.userId], f = db[d.to], a = Number(d.amount);
        if (me && f && me.coin >= a && a > 0) {
            me.coin -= a; f.coin += a;
            socket.emit('updateUI', me);
            io.emit('updateUI_specific', { userId: d.to, data: f });
        }
    });

    socket.on('admin_getRequests', () => socket.emit('admin_updateRequests', pendingRequests));

    socket.on('admin_approve', (uid) => {
        if (db[uid]) {
            db[uid].cash += 500;
            pendingRequests = pendingRequests.filter(r => r.id !== uid);
            io.emit('admin_updateRequests', pendingRequests);
            io.emit('updateUI_specific', { userId: uid, data: db[uid] });
        }
    });

    socket.on('admin_setPrice', (p) => {
        currentPrice = Number(p);
        cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
        io.emit('tick', { price: currentPrice });
    });

    socket.on('admin_giveAsset', (d) => {
        let target = db[d.id];
        if (target) {
            if (d.type === 'cash') target.cash += Number(d.amount);
            else target.coin += Number(d.amount);
            io.emit('updateUI_specific', { userId: d.id, data: target });
        }
    });

    socket.on('admin_resetAll', () => {
        db = {};
        pendingRequests = [];
        currentPrice = 100;
        cOpen = 100; cHigh = 100; cLow = 100;
        lastTime = Math.floor(Date.now() / 1000);
        initCandles();
        io.emit('forceReload');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0');
