const express = require(‘express’);
const http = require(‘http’);
const { Server } = require(‘socket.io’);
const path = require(‘path’);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ‘*’ } });

app.use(express.static(path.join(__dirname, ‘public’)));

// ─── State ───────────────────────────────────────────────────────────────────
const rooms = {}; // roomId → RoomState

function generateRoomId() {
return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Role distribution table
const ROLE_TABLE = {
4:  { werewolf: 1, seer: 1, bodyguard: 0, villager: 2 },
5:  { werewolf: 1, seer: 1, bodyguard: 1, villager: 2 },
6:  { werewolf: 2, seer: 1, bodyguard: 1, villager: 2 },
7:  { werewolf: 2, seer: 1, bodyguard: 1, villager: 3 },
8:  { werewolf: 2, seer: 1, bodyguard: 1, villager: 4 },
9:  { werewolf: 3, seer: 1, bodyguard: 1, villager: 4 },
10: { werewolf: 3, seer: 1, bodyguard: 1, villager: 5 },
};

function buildRoleDeck(playerCount) {
const dist = ROLE_TABLE[playerCount];
const deck = [];
for (let i = 0; i < dist.werewolf;  i++) deck.push(‘werewolf’);
for (let i = 0; i < dist.seer;      i++) deck.push(‘seer’);
for (let i = 0; i < dist.bodyguard; i++) deck.push(‘bodyguard’);
for (let i = 0; i < dist.villager;  i++) deck.push(‘villager’);
// Fisher-Yates shuffle
for (let i = deck.length - 1; i > 0; i–) {
const j = Math.floor(Math.random() * (i + 1));
[deck[i], deck[j]] = [deck[j], deck[i]];
}
return deck;
}

function getRoomList() {
return Object.entries(rooms).map(([id, r]) => ({
id,
name: r.name,
playerCount: Object.keys(r.players).length,
maxPlayers: r.maxPlayers,
hasPassword: !!r.password,
phase: r.phase,
}));
}

function broadcastRoomList() {
io.emit(‘roomList’, getRoomList());
}

function checkWinCondition(room) {
const alive = Object.values(room.players).filter(p => p.alive);
const wolves = alive.filter(p => p.role === ‘werewolf’).length;
const villagers = alive.filter(p => p.role !== ‘werewolf’).length;
if (wolves === 0) return ‘villager’;
if (wolves >= villagers) return ‘werewolf’;
return null;
}

function revealRoles(room) {
return Object.values(room.players).map(p => ({
id: p.id,
name: p.name,
avatar: p.avatar,
role: p.role,
alive: p.alive,
}));
}

// ─── Night Phase Logic ────────────────────────────────────────────────────────
function startNightPhase(room) {
room.phase = ‘night’;
room.nightActions = { werewolfVotes: {}, seerTarget: null, bodyguardTarget: null };
room.nightStep = ‘werewolf’; // werewolf → seer → bodyguard → resolve

io.to(room.id).emit(‘phaseChange’, { phase: ‘night’, round: room.round });
io.to(room.id).emit(‘narratorSpeak’, ‘ทุกคนหลับตา และโน้มศีรษะลง’);

setTimeout(() => startWerewolfTurn(room), 3000);
}

function startWerewolfTurn(room) {
room.nightStep = ‘werewolf’;
io.to(room.id).emit(‘narratorSpeak’, ‘หมาป่าลืมตาขึ้น’);
io.to(room.id).emit(‘narratorSpeak’, ‘หมาป่าเลือกเหยื่อของคุณ’);
io.to(room.id).emit(‘nightStep’, { step: ‘werewolf’ });

// Tell wolves who each other are
const wolves = Object.values(room.players).filter(p => p.role === ‘werewolf’ && p.alive);
const wolfIds = wolves.map(w => w.id);
wolves.forEach(w => {
io.to(w.socketId).emit(‘werewolfReveal’, wolfIds);
});
}

function startSeerTurn(room) {
room.nightStep = ‘seer’;
io.to(room.id).emit(‘narratorSpeak’, ‘หมาป่าหลับตาลง’);
setTimeout(() => {
io.to(room.id).emit(‘narratorSpeak’, ‘ผู้หยั่งรู้ลืมตาขึ้น เลือกผู้ที่คุณต้องการตรวจสอบ’);
io.to(room.id).emit(‘nightStep’, { step: ‘seer’ });
const seer = Object.values(room.players).find(p => p.role === ‘seer’ && p.alive);
if (seer) io.to(seer.socketId).emit(‘yourTurn’, { action: ‘seer’ });
else resolveBodyguardTurn(room);
}, 2000);
}

function resolveBodyguardTurn(room) {
room.nightStep = ‘bodyguard’;
io.to(room.id).emit(‘narratorSpeak’, ‘ผู้หยั่งรู้หลับตาลง’);
setTimeout(() => {
const bg = Object.values(room.players).find(p => p.role === ‘bodyguard’ && p.alive);
if (bg) {
io.to(room.id).emit(‘narratorSpeak’, ‘บอดี้การ์ดลืมตาขึ้น เลือกผู้ที่คุณต้องการปกป้อง’);
io.to(room.id).emit(‘nightStep’, { step: ‘bodyguard’ });
io.to(bg.socketId).emit(‘yourTurn’, { action: ‘bodyguard’, lastProtected: room.lastProtected || null });
} else {
resolveNight(room);
}
}, 2000);
}

function resolveNight(room) {
io.to(room.id).emit(‘narratorSpeak’, ‘บอดี้การ์ดหลับตาลง’);
setTimeout(() => {
io.to(room.id).emit(‘narratorSpeak’, ‘ทุกคนลืมตาขึ้นได้’);
io.to(room.id).emit(‘nightStep’, { step: ‘resolve’ });

```
// Determine werewolf kill target (majority vote)
const votes = room.nightActions.werewolfVotes;
const voteCount = {};
Object.values(votes).forEach(t => { voteCount[t] = (voteCount[t] || 0) + 1; });
let killTarget = null;
let maxVotes = 0;
for (const [tid, cnt] of Object.entries(voteCount)) {
  if (cnt > maxVotes) { maxVotes = cnt; killTarget = tid; }
}

const bodyguardTarget = room.nightActions.bodyguardTarget;
let killed = null;
if (killTarget && killTarget !== bodyguardTarget) {
  const victim = room.players[killTarget];
  if (victim) { victim.alive = false; killed = killTarget; }
}
room.lastProtected = bodyguardTarget;

setTimeout(() => {
  startDayPhase(room, killed);
}, 2500);
```

}, 2000);
}

// ─── Day Phase Logic ──────────────────────────────────────────────────────────
function startDayPhase(room, killed) {
room.phase = ‘day’;
room.round++;
room.votes = {};

const winner = checkWinCondition(room);
if (winner) { endGame(room, winner); return; }

let narratorMsg;
if (killed) {
const victim = room.players[killed];
narratorMsg = `รุ่งอรุณมาถึง... ${victim ? victim.name : 'ผู้เล่นหนึ่ง'} ถูกพบว่าเสียชีวิตในคืนนี้`;
} else {
narratorMsg = ‘คืนนี้ไม่มีใครตาย ปาฏิหาริย์เกิดขึ้น’;
}
io.to(room.id).emit(‘narratorSpeak’, narratorMsg);
io.to(room.id).emit(‘phaseChange’, {
phase: ‘day’,
round: room.round,
killed,
players: getPublicPlayers(room),
});

// Auto start vote after 60s
room.dayTimer = setTimeout(() => {
if (room.phase === ‘day’) startVoting(room);
}, 60000);
}

function startVoting(room) {
if (room.dayTimer) { clearTimeout(room.dayTimer); room.dayTimer = null; }
room.phase = ‘voting’;
room.votes = {};
io.to(room.id).emit(‘narratorSpeak’, ‘ถึงเวลาโหวตแล้ว’);
io.to(room.id).emit(‘votingOpen’, { players: getPublicPlayers(room) });

room.voteTimer = setTimeout(() => resolveVote(room), 30000);
}

function resolveVote(room) {
if (room.voteTimer) { clearTimeout(room.voteTimer); room.voteTimer = null; }
const tally = {};
Object.values(room.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });

let maxVotes = 0;
let eliminated = null;
let tied = false;
for (const [tid, cnt] of Object.entries(tally)) {
if (cnt > maxVotes) { maxVotes = cnt; eliminated = tid; tied = false; }
else if (cnt === maxVotes) tied = true;
}
if (tied) eliminated = null;

if (eliminated && room.players[eliminated]) {
room.players[eliminated].alive = false;
}

io.to(room.id).emit(‘eliminationResult’, {
eliminated,
players: getPublicPlayers(room),
tally,
});

const winner = checkWinCondition(room);
if (winner) {
setTimeout(() => endGame(room, winner), 3000);
} else {
setTimeout(() => startNightPhase(room), 4000);
}
}

function endGame(room, winner) {
room.phase = ‘ended’;
io.to(room.id).emit(‘gameOver’, { winner, roles: revealRoles(room) });
}

function getPublicPlayers(room) {
return Object.values(room.players).map(p => ({
id: p.id,
name: p.name,
avatar: p.avatar,
alive: p.alive,
socketId: p.socketId,
}));
}

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on(‘connection’, (socket) => {
console.log(‘Connected:’, socket.id);

socket.emit(‘roomList’, getRoomList());

// Create Room
socket.on(‘createRoom’, ({ roomName, password, maxPlayers, playerName, avatar }) => {
const roomId = generateRoomId();
const player = { id: socket.id, socketId: socket.id, name: playerName, avatar, role: null, alive: true };
rooms[roomId] = {
id: roomId,
name: roomName,
password: password || ‘’,
maxPlayers,
players: { [socket.id]: player },
host: socket.id,
phase: ‘waiting’,
round: 0,
roleDeck: [],
cardSelectionOrder: [],
currentCardPicker: null,
nightActions: {},
votes: {},
lastProtected: null,
dayTimer: null,
voteTimer: null,
};
socket.join(roomId);
socket.roomId = roomId;
socket.emit(‘roomCreated’, { roomId });
socket.emit(‘waitingRoom’, {
roomId,
roomName,
maxPlayers,
players: getPublicPlayers(rooms[roomId]),
isHost: true,
});
broadcastRoomList();
});

// Join Room
socket.on(‘joinRoom’, ({ roomId, password, playerName, avatar }) => {
const room = rooms[roomId];
if (!room) { socket.emit(‘joinError’, ‘ไม่พบห้องนี้’); return; }
if (room.phase !== ‘waiting’) { socket.emit(‘joinError’, ‘เกมเริ่มไปแล้ว’); return; }
if (Object.keys(room.players).length >= room.maxPlayers) { socket.emit(‘joinError’, ‘ห้องเต็มแล้ว’); return; }
if (room.password && room.password !== password) { socket.emit(‘joinError’, ‘รหัสผ่านไม่ถูกต้อง’); return; }

```
const player = { id: socket.id, socketId: socket.id, name: playerName, avatar, role: null, alive: true };
room.players[socket.id] = player;
socket.join(roomId);
socket.roomId = roomId;

io.to(roomId).emit('playerJoined', { players: getPublicPlayers(room) });
socket.emit('waitingRoom', {
  roomId,
  roomName: room.name,
  maxPlayers: room.maxPlayers,
  players: getPublicPlayers(room),
  isHost: false,
});
broadcastRoomList();
```

});

// Start Game
socket.on(‘startGame’, () => {
const room = rooms[socket.roomId];
if (!room || room.host !== socket.id) return;
if (Object.keys(room.players).length < room.maxPlayers) return;

```
room.phase = 'card-selection';
room.roleDeck = buildRoleDeck(room.maxPlayers);
room.cardSelectionOrder = Object.keys(room.players).sort(() => Math.random() - 0.5);
room.cardSelectionIndex = 0;

// Countdown
io.to(room.id).emit('gameStarting');
let count = 3;
const cd = setInterval(() => {
  io.to(room.id).emit('countdown', count);
  count--;
  if (count < 0) {
    clearInterval(cd);
    advanceCardSelection(room);
  }
}, 1000);
```

});

function advanceCardSelection(room) {
if (room.cardSelectionIndex >= room.cardSelectionOrder.length) {
// All cards selected — send roles privately
Object.values(room.players).forEach(p => {
io.to(p.socketId).emit(‘roleReveal’, { role: p.role });
});
io.to(room.id).emit(‘allCardsSelected’);
return;
}
const pickerId = room.cardSelectionOrder[room.cardSelectionIndex];
room.currentCardPicker = pickerId;
io.to(room.id).emit(‘cardSelectionTurn’, { pickerId, pickerName: room.players[pickerId]?.name });
io.to(pickerId).emit(‘yourCardTurn’, { cardCount: room.roleDeck.length });
}

// Card Selected
socket.on(‘selectCard’, ({ cardIndex }) => {
const room = rooms[socket.roomId];
if (!room || room.currentCardPicker !== socket.id) return;
const role = room.roleDeck.splice(cardIndex, 1)[0];
room.players[socket.id].role = role;
room.cardSelectionIndex++;
io.to(socket.id).emit(‘cardFlipped’, { role });
setTimeout(() => advanceCardSelection(room), 2000);
});

// Player ready after seeing role
socket.on(‘playerReady’, () => {
const room = rooms[socket.roomId];
if (!room) return;
room.players[socket.id].ready = true;
const allReady = Object.values(room.players).every(p => p.ready);
if (allReady) {
Object.values(room.players).forEach(p => { p.ready = false; });
startNightPhase(room);
}
});

// Night Actions
socket.on(‘werewolfVote’, ({ targetId }) => {
const room = rooms[socket.roomId];
if (!room || room.nightStep !== ‘werewolf’) return;
const player = room.players[socket.id];
if (!player || player.role !== ‘werewolf’ || !player.alive) return;
room.nightActions.werewolfVotes[socket.id] = targetId;

```
const wolves = Object.values(room.players).filter(p => p.role === 'werewolf' && p.alive);
const allVoted = wolves.every(w => room.nightActions.werewolfVotes[w.id]);
if (allVoted) startSeerTurn(room);
else io.to(room.id).emit('werewolfVoteUpdate', { votes: room.nightActions.werewolfVotes });
```

});

socket.on(‘seerCheck’, ({ targetId }) => {
const room = rooms[socket.roomId];
if (!room || room.nightStep !== ‘seer’) return;
const player = room.players[socket.id];
if (!player || player.role !== ‘seer’ || !player.alive) return;
const target = room.players[targetId];
if (!target) return;
const isWolf = target.role === ‘werewolf’;
io.to(socket.id).emit(‘seerResult’, { targetId, isWolf, targetName: target.name });
resolveBodyguardTurn(room);
});

socket.on(‘bodyguardProtect’, ({ targetId }) => {
const room = rooms[socket.roomId];
if (!room || room.nightStep !== ‘bodyguard’) return;
const player = room.players[socket.id];
if (!player || player.role !== ‘bodyguard’ || !player.alive) return;
if (room.lastProtected === targetId) {
socket.emit(‘bodyguardError’, ‘ไม่สามารถปกป้องคนเดิมติดต่อกันสองคืน’);
return;
}
room.nightActions.bodyguardTarget = targetId;
resolveNight(room);
});

// Voting
socket.on(‘startVote’, () => {
const room = rooms[socket.roomId];
if (!room || room.phase !== ‘day’) return;
startVoting(room);
});

socket.on(‘castVote’, ({ targetId }) => {
const room = rooms[socket.roomId];
if (!room || room.phase !== ‘voting’) return;
const voter = room.players[socket.id];
if (!voter || !voter.alive) return;
room.votes[socket.id] = targetId;
io.to(room.id).emit(‘voteUpdate’, { votes: room.votes });
});

// Play Again
socket.on(‘playAgain’, () => {
const room = rooms[socket.roomId];
if (!room || room.host !== socket.id) return;
room.phase = ‘waiting’;
room.round = 0;
room.roleDeck = [];
room.cardSelectionOrder = [];
room.currentCardPicker = null;
room.nightActions = {};
room.votes = {};
room.lastProtected = null;
Object.values(room.players).forEach(p => { p.role = null; p.alive = true; p.ready = false; });
io.to(room.id).emit(‘waitingRoom’, {
roomId: room.id,
roomName: room.name,
maxPlayers: room.maxPlayers,
players: getPublicPlayers(room),
isHost: false, // client will fix based on socket id
});
io.to(room.host).emit(‘waitingRoom’, {
roomId: room.id,
roomName: room.name,
maxPlayers: room.maxPlayers,
players: getPublicPlayers(room),
isHost: true,
});
});

// Disconnect
socket.on(‘disconnect’, () => {
const roomId = socket.roomId;
if (!roomId || !rooms[roomId]) return;
const room = rooms[roomId];
if (room.players[socket.id]) {
room.players[socket.id].online = false;
room.players[socket.id].alive = false;
}
io.to(roomId).emit(‘playerLeft’, { playerId: socket.id, players: getPublicPlayers(room) });

```
const remaining = Object.values(room.players).filter(p => p.online !== false);
if (remaining.length === 0) {
  delete rooms[roomId];
} else if (room.host === socket.id) {
  room.host = remaining[0].id;
  io.to(remaining[0].socketId).emit('youAreHost');
}
broadcastRoomList();
```

});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐺 Werewolf server running on http://localhost:${PORT}`));