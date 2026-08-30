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

// ========== ACCOUNTS (simple file-based) ==========
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; // username -> { password, data }
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
const players = {}; // socketId -> player data
const droppedFruits = {}; // id -> { fruit, x, y, z, owner }
let fruitIdCounter = 1;
const NPC_POS = { x: 20, y: 8, z: 40 };

function createPlayer(id, name) {
  return {
    id,
    name: name || `Player_${id.slice(0, 5)}`,
    x: NPC_POS.x + (Math.random() - 0.5) * 4,
    y: NPC_POS.y,
    z: NPC_POS.z + (Math.random() - 0.5) * 4,
    rotY: 0,
    hp: 15,
    maxHp: 15,
    level: 1,
    exp: 0,
    dollars: 0,
    isGiant: false,
    isDragon: false,
    isFlying: false,
    fruit: null,
    fruitAwakened: false,
    haki: false,
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
        level: 1, exp: 0, maxHp: 15, hp: 15,
        dollars: 0, damageMult: 1, destroyMult: 1,
        inventory: [], activeFruitId: null
      }
    };
    saveAccounts();
    socket.emit('registerResult', { ok: true });
    console.log(`Registered: ${username}`);
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
    console.log(`Logged in: ${username}`);
  });

  // Khôi phục acc từ client khi server bị mất file (Render free)
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
        level: 1, exp: 0, maxHp: 15, hp: 15,
        dollars: 0, damageMult: 1, destroyMult: 1,
        inventory: [], activeFruitId: null
      }
    };
    saveAccounts();
    socket.username = username;
    socket.emit('loginResult', { ok: true, username, data: accounts[username].data });
    console.log(`Synced + logged in: ${username}`);
  });

  socket.on('saveData', (data) => {
    if (!socket.username || !accounts[socket.username]) return;
    accounts[socket.username].data = {
      level: data.level || 1,
      exp: data.exp || 0,
      maxHp: data.maxHp || 15,
      hp: data.hp || 15,
      dollars: data.dollars || 0,
      damageMult: data.damageMult || 1,
      destroyMult: data.destroyMult || 1,
      inventory: data.inventory || [],
      activeFruitId: data.activeFruitId || null
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
      players[socket.id].hp = d.hp || 15;
      players[socket.id].maxHp = d.maxHp || 15;
    }
    console.log(`Player joined: ${players[socket.id].name}`);
    socket.emit('currentPlayers', players);
    // send existing dropped fruits
    for (const id in droppedFruits) {
      socket.emit('fruitDropped', { id, ...droppedFruits[id] });
    }
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
    if (typeof data.isGiant === 'boolean') p.isGiant = data.isGiant;
    if (typeof data.isDragon === 'boolean') p.isDragon = data.isDragon;
    if (typeof data.isFlying === 'boolean') p.isFlying = data.isFlying;
    if (typeof data.haki === 'boolean') p.haki = data.haki;
    if (data.fruit !== undefined) p.fruit = data.fruit;
    if (typeof data.fruitAwakened === 'boolean') p.fruitAwakened = data.fruitAwakened;
    if (typeof data.hp === 'number') p.hp = Math.max(0, Math.min(p.maxHp, data.hp));
    if (typeof data.maxHp === 'number') p.maxHp = data.maxHp;
    if (typeof data.level === 'number') p.level = data.level;
    p.lastUpdate = Date.now();
    socket.broadcast.emit('playerMoved', {
      id: socket.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
      isGiant: p.isGiant, isDragon: p.isDragon, isFlying: p.isFlying,
      haki: p.haki, fruit: p.fruit, fruitAwakened: p.fruitAwakened,
      hp: p.hp, maxHp: p.maxHp, level: p.level
    });
  });

  // ===== PVP =====
  socket.on('dealDamage', (data) => {
    const attacker = players[socket.id];
    const target = players[data.targetId];
    if (!attacker || !target) return;
    const dmg = 0.2;
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
      target.isGiant = false; target.isDragon = false; target.isFlying = false; target.fruitAwakened = false;
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

  // ===== DROP / PICK FRUIT =====
  socket.on('dropFruit', (data) => {
    if (!data || !data.fruit) return;
    const id = 'f' + (fruitIdCounter++);
    droppedFruits[id] = {
      fruit: data.fruit,
      x: data.x, y: data.y, z: data.z
    };
    io.emit('fruitDropped', { id, ...droppedFruits[id] });
  });

  socket.on('pickFruit', (data) => {
    const f = droppedFruits[data.id];
    if (!f) return;
    delete droppedFruits[data.id];
    io.emit('fruitPicked', { id: data.id, fruit: f.fruit, pickerId: socket.id });
  });

  // ===== DISCONNECT =====
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    // auto save on disconnect
    if (socket.username && accounts[socket.username] && players[socket.id]) {
      // client should have been saving; nothing extra needed
    }
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
  console.log(`One Piece 3D Multiplayer Server running on port ${PORT}`);
});
