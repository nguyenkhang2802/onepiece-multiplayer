const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ========== GAME STATE ==========
const players = {}; // socketId -> player data
const NPC_POS = { x: 0, y: 0, z: 0 };

function createPlayer(id, name) {
  return {
    id,
    name: name || `Player_${id.slice(0, 5)}`,
    x: NPC_POS.x + (Math.random() - 0.5) * 4,
    y: 0,
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
    fruit: null,          // active fruit id or null
    fruitAwakened: false,
    haki: false,
    color: 0xcc0000,      // default red-ish for visibility
    lastUpdate: Date.now()
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Player joins
  socket.on('join', (data) => {
    const name = (data && data.name) ? String(data.name).slice(0, 16) : null;
    players[socket.id] = createPlayer(socket.id, name);
    console.log(`Player joined: ${players[socket.id].name}`);

    // Send current players to the new one
    socket.emit('currentPlayers', players);
    // Notify others
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  // Position / state update (high frequency)
  socket.on('playerUpdate', (data) => {
    const p = players[socket.id];
    if (!p) return;

    // Basic validation
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

    // Broadcast to others (not self)
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: p.x, y: p.y, z: p.z,
      rotY: p.rotY,
      isGiant: p.isGiant,
      isDragon: p.isDragon,
      isFlying: p.isFlying,
      haki: p.haki,
      fruit: p.fruit,
      fruitAwakened: p.fruitAwakened,
      hp: p.hp,
      maxHp: p.maxHp,
      level: p.level
    });
  });

  // Damage request (PvP)
  socket.on('dealDamage', (data) => {
    const attacker = players[socket.id];
    const target = players[data.targetId];
    if (!attacker || !target) return;

    const dmg = 0.2; // fixed as requested
    target.hp = Math.max(0, target.hp - dmg);

    // Notify everyone about the damage
    io.emit('playerDamaged', {
      targetId: data.targetId,
      attackerId: socket.id,
      damage: dmg,
      newHp: target.hp,
      maxHp: target.maxHp
    });

    // If dead → respawn near NPC
    if (target.hp <= 0) {
      target.hp = target.maxHp;
      target.x = NPC_POS.x + (Math.random() - 0.5) * 3;
      target.y = 0;
      target.z = NPC_POS.z + (Math.random() - 0.5) * 3;
      target.isGiant = false;
      target.isDragon = false;
      target.isFlying = false;
      target.fruitAwakened = false;

      io.emit('playerRespawned', {
        id: data.targetId,
        x: target.x,
        y: target.y,
        z: target.z,
        hp: target.hp,
        maxHp: target.maxHp
      });
    }
  });

  // Simple chat (optional)
  socket.on('chat', (msg) => {
    const p = players[socket.id];
    if (!p) return;
    const text = String(msg || '').slice(0, 120);
    io.emit('chatMessage', { id: socket.id, name: p.name, text });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    if (players[socket.id]) {
      io.emit('playerLeft', socket.id);
      delete players[socket.id];
    }
  });
});

// Clean up stale players (optional safety)
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
  console.log(`Open http://localhost:${PORT} in browser`);
});
