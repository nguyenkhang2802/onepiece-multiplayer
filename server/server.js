const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ========== ACCOUNTS ==========
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let accounts = {};
try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  }
} catch (e) { accounts = {}; }

function saveAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  } catch (e) { console.error('Save accounts error', e); }
}

// ========== GAME STATE ==========
const players = {};
const NPC_POS = { x: 20, y: 8, z: 40 };

function createPlayer(id, name) {
  return {
    id,
    name: name || `Ninja_${id.slice(0, 5)}`,
    x: NPC_POS.x + (Math.random() - 0.5) * 4,
    y: NPC_POS.y,
    z: NPC_POS.z + (Math.random() - 0.5) * 4,
    rotY: 0,
    hp: 20,
    maxHp: 20,
    chakra: 100,
    maxChakra: 100,
    level: 1,
    exp: 0,
    lastUpdate: Date.now()
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ===== AUTH =====
  socket.on('register', (data) => {
    const username = String(data.username || '').trim().slice(0, 16);
    const password = String(data.password || '').slice(0, 24);
    if (!username || !password) {
      socket.emit('registerResult', { ok: false, msg: 'Thiếu tên hoặc mật khẩu' });
      return;
    }
    if (accounts[username]) {
      socket.emit('registerResult', { ok: false, msg: 'Trùng tên đăng nhập!' });
      return;
    }
    accounts[username] = {
      password,
      data: {
        level: 1, exp: 0, maxHp: 20, hp: 20,
        maxChakra: 100, chakra: 100
      }
    };
    saveAccounts();
    socket.emit('registerResult', { ok: true });
  });

  socket.on('login', (data) => {
    const username = String(data.username || '').trim().slice(0, 16);
    const password = String(data.password || '').slice(0, 24);
    const acc = accounts[username];
    if (!acc || acc.password !== password) {
      socket.emit('loginResult', { ok: false, msg: 'Sai tên đăng nhập hoặc mật khẩu' });
      return;
    }
    socket.username = username;
    socket.emit('loginResult', { ok: true, username, data: acc.data || {} });
  });

  socket.on('syncAccount', (data) => {
    const username = String(data.username || '').trim().slice(0, 16);
    const password = String(data.password || '').slice(0, 24);
    if (!username || !password) {
      socket.emit('loginResult', { ok: false, msg: 'Thiếu thông tin đồng bộ' });
      return;
    }
    if (accounts[username] && accounts[username].password !== password) {
      socket.emit('loginResult', { ok: false, msg: 'Tên đã tồn tại với mật khẩu khác' });
      return;
    }
    accounts[username] = {
      password,
      data: data.data || {
        level: 1, exp: 0, maxHp: 20, hp: 20,
        maxChakra: 100, chakra: 100
      }
    };
    saveAccounts();
    socket.username = username;
    socket.emit('loginResult', { ok: true, username, data: accounts[username].data });
  });

  socket.on('saveData', (data) => {
    if (!socket.username || !accounts[socket.username]) return;
    accounts[socket.username].data = {
      level: data.level || 1,
      exp: data.exp || 0,
      maxHp: data.maxHp || 20,
      hp: data.hp || 20,
      maxChakra: data.maxChakra || 100,
      chakra: data.chakra || 100
    };
    saveAccounts();
  });

  // ===== JOIN =====
  socket.on('join', (data) => {
    const name = (data && data.name) ? String(data.name).slice(0, 16) : (socket.username || null);
    players[socket.id] = createPlayer(socket.id, name);
    if (socket.username && accounts[socket.username]) {
      const d = accounts[socket.username].data;
      players[socket.id].level = d.level || 1;
      players[socket.id].hp = d.hp || 20;
      players[socket.id].maxHp = d.maxHp || 20;
      players[socket.id].chakra = d.chakra || 100;
      players[socket.id].maxChakra = d.maxChakra || 100;
    }
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  // ===== UPDATE =====
  socket.on('playerUpdate', (data) => {
    const p = players[socket.id];
    if (!p) return;
    if (typeof data.x === 'number') p.x = data.x;
    if (typeof data.y === 'number') p.y = data.y;
    if (typeof data.z === 'number') p.z = data.z;
    if (typeof data.rotY === 'number') p.rotY = data.rotY;
    if (typeof data.hp === 'number') p.hp = Math.max(0, Math.min(p.maxHp, data.hp));
    if (typeof data.maxHp === 'number') p.maxHp = data.maxHp;
    if (typeof data.chakra === 'number') p.chakra = Math.max(0, Math.min(p.maxChakra, data.chakra));
    if (typeof data.level === 'number') p.level = data.level;
    p.lastUpdate = Date.now();
    socket.broadcast.emit('playerMoved', {
      id: socket.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
      hp: p.hp, maxHp: p.maxHp, chakra: p.chakra, maxChakra: p.maxChakra, level: p.level
    });
  });

  // ===== PVP =====
  socket.on('dealDamage', (data) => {
    const attacker = players[socket.id];
    const target = players[data.targetId];
    if (!attacker || !target) return;
    const dmg = data.damage || 2;
    target.hp = Math.max(0, target.hp - dmg);
    io.emit('playerDamaged', {
      targetId: data.targetId, attackerId: socket.id,
      damage: dmg, newHp: target.hp, maxHp: target.maxHp
    });
    if (target.hp <= 0) {
      target.hp = target.maxHp;
      target.x = NPC_POS.x + (Math.random() - 0.5) * 3;
      target.y = NPC_POS.y;
      target.z = NPC_POS.z + (Math.random() - 0.5) * 3;
      io.emit('playerRespawned', {
        id: data.targetId, x: target.x, y: target.y, z: target.z,
        hp: target.hp, maxHp: target.maxHp
      });
    }
  });

  // ===== CHAT =====
  socket.on('chat', (msg) => {
    const p = players[socket.id];
    if (!p) return;
    const text = String(msg || '').slice(0, 120);
    if (!text) return;
    io.emit('chatMessage', { id: socket.id, name: p.name, text });
  });

  // ===== DISCONNECT =====
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    if (players[socket.id]) {
      io.emit('playerLeft', socket.id);
      delete players[socket.id];
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const id in players) {
    if (now - players[id].lastUpdate > 60000) {
      io.emit('playerLeft', id);
      delete players[id];
    }
  }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Naruto 3D Multiplayer Server running on port ${PORT}`);
});
