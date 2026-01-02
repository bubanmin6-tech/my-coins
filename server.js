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
let cOpen = 100, cHigh = 100, cLow = 100;
let lastTime = Math.floor(Date.now() / 1000) - 500;

function initCandles() {
    candles = [];
    let now = Math.floor(Date.now() / 1000) - 250;
    for(let i=0; i<50; i++) {
        let t = now + (i * 5);
        candles.push({ time: t, open: 100, high: 100, low: 100, close: 100 });
        lastTime = t;
    }
}
initCandles();

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

setInterval(() => {
    const r = Math.random() * 100;
    const drift = Math.floor(Math.random() * 6) + 1;
    if (r < 50) currentPrice += drift;
    else currentPrice -= drift;
    
    if (currentPrice < 1) currentPrice = 1;
    if (currentPrice > cHigh) cHigh = currentPrice;
    if (currentPrice < cLow) cLow = currentPrice;

    let ranking = Object.values(db).map(u => ({ 
        id: u.id, 
        total: Math.floor(u.cash + (u.coin * currentPrice))
    })).sort((a, b) => b.total - a.total).slice(0, 5);

    io.emit('tick', { price: currentPrice, ranking: ranking });
}, 1000);

setInterval(() => {
    lastTime += 5;
    const candle = { time: lastTime, open: cOpen, high: cHigh, low: cLow, close: currentPrice };
    candles.push(candle);
    if (candles.length > 100) candles.shift();
    cOpen = currentPrice; cHigh = currentPrice; cLow = currentPrice;
    io.emit('candleUpdate', candles);
}, 5000);

io.on('connection', (socket) => {
    socket.on('join', (id) => {
        let uid = id || "user_" + Math.floor(Math.random()*1000);
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
        }
    });

    socket.on('sell', (q) => {
        let u = db[socket.userId];
        if (u && u.coin >= Number(q)) { 
            u.cash += currentPrice * Number(q); u.coin -= Number(q); 
            socket.emit('updateUI', u); 
        }
    });

    socket.on('requestCharge', () => {
        if(db[socket.userId]) {
            db[socket.userId].cash += 500;
            socket.emit('updateUI', db[socket.userId]);
        }
    });

    socket.on('sendCoin', (d) => {
        let me = db[socket.userId], f = db[d.to], a = Number(d.amount);
        if (me && f && me.coin >= a && a > 0) { 
            me.coin -= a; f.coin += a; 
            socket.emit('updateUI', me); 
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`RUNNING`));
