// game.js — Werewolf Client Logic

const socket = io();

// ─── State ─────────────────────────────────────────────────────────────────
let state = {
  myId: null,
  myName: '',
  myAvatar: '🐺',
  selectedCount: 5,
  currentRoom: null,
  isHost: false,
  role: null,
  players: [],        // [{id, name, avatar, alive}]
  phase: 'waiting',
  round: 0,
  votes: {},
  voteTarget: null,
  pendingJoinRoom: null,
  timerInterval: null,
  timerSeconds: 0,
  lastSeerResult: null,
  werewolfVotes: {},  // my werewolf vote
};

const AVATARS = ['🐺','🦊','🦁','🐻','🦅','🦉','🐗','🐍','🦇','🦌','🐺','🐦','🧙','🧛','🧜','🧚'];
const ROLE_INFO = {
  werewolf:  { icon: '🐺', name: 'หมาป่า',    desc: 'ตื่นตอนกลางคืน เลือกเหยื่อ คุณรู้จักหมาป่าคนอื่น ชนะเมื่อเท่ากับหรือมากกว่าชาวบ้านที่เหลือ' },
  seer:      { icon: '👁️', name: 'ผู้หยั่งรู้', desc: 'ตื่นตอนกลางคืน ตรวจสอบผู้เล่นหนึ่งคน รู้ว่าเป็น 👍 (ดี) หรือ 👎 (หมาป่า)' },
  bodyguard: { icon: '🛡️', name: 'บอดี้การ์ด', desc: 'ตื่นตอนกลางคืน ปกป้องผู้เล่นหนึ่งคนจากหมาป่า ไม่สามารถปกป้องคนเดิมสองคืนติดต่อกัน' },
  villager:  { icon: '👥', name: 'ชาวบ้าน',    desc: 'ไม่มีพลังพิเศษ ชนะด้วยการโหวตขับไล่หมาป่าทั้งหมด' },
};

// ─── Screens ─────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
}

// ─── Stars ───────────────────────────────────────────────────────────────────
function initStars() {
  document.querySelectorAll('.stars').forEach(container => {
    for (let i = 0; i < 120; i++) {
      const s = document.createElement('div');
      s.style.cssText = `position:absolute; width:${Math.random()*2+0.5}px; height:${Math.random()*2+0.5}px; background:rgba(220,220,255,${Math.random()*0.7+0.1}); border-radius:50%; left:${Math.random()*100}%; top:${Math.random()*100}%; animation: starTwinkle ${2+Math.random()*4}s ease-in-out infinite; animation-delay: ${Math.random()*5}s;`;
      container.appendChild(s);
    }
  });
  if (!document.getElementById('starStyle')) {
    const style = document.createElement('style');
    style.id = 'starStyle';
    style.textContent = `@keyframes starTwinkle { 0%,100%{opacity:0.2;} 50%{opacity:1;} }`;
    document.head.appendChild(style);
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ─── Profile ─────────────────────────────────────────────────────────────────
function initProfile() {
  const grid = document.getElementById('avatarGrid');
  AVATARS.forEach(av => {
    const d = document.createElement('div');
    d.className = 'avatar-option';
    d.textContent = av;
    d.onclick = () => selectAvatar(av);
    grid.appendChild(d);
  });

  const saved = JSON.parse(localStorage.getItem('ww_profile') || '{}');
  if (saved.name) document.getElementById('playerName').value = saved.name;
  if (saved.avatar) selectAvatar(saved.avatar);
  else selectAvatar(AVATARS[0]);
}

function selectAvatar(av) {
  state.myAvatar = av;
  document.getElementById('avatarPreview').textContent = av;
  document.querySelectorAll('.avatar-option').forEach(el => {
    el.classList.toggle('selected', el.textContent === av);
  });
}

function saveProfile() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อผู้เล่น', 'error'); return; }
  state.myName = name;
  localStorage.setItem('ww_profile', JSON.stringify({ name, avatar: state.myAvatar }));
  toast('บันทึกโปรไฟล์แล้ว ✓', 'success');
}

function loadProfile() {
  const saved = JSON.parse(localStorage.getItem('ww_profile') || '{}');
  state.myName = saved.name || '';
  state.myAvatar = saved.avatar || '🐺';
}

// ─── Room List ────────────────────────────────────────────────────────────────
function showJoinRoom() {
  const s = document.getElementById('roomListSection');
  s.classList.toggle('hidden');
}

function showCreateRoom() {
  if (!ensureProfile()) return;
  initPlayerCountGrid();
  document.getElementById('modal-createRoom').classList.remove('hidden');
}

function ensureProfile() {
  const name = document.getElementById('playerName').value.trim();
  if (name) { state.myName = name; state.myAvatar = state.myAvatar || AVATARS[0]; }
  if (!state.myName) {
    toast('กรุณาบันทึกโปรไฟล์ก่อน', 'error');
    return false;
  }
  return true;
}

function initPlayerCountGrid() {
  const g = document.getElementById('playerCountGrid');
  g.innerHTML = '';
  for (let n = 4; n <= 10; n++) {
    const b = document.createElement('button');
    b.className = 'count-option' + (n === state.selectedCount ? ' selected' : '');
    b.textContent = n;
    b.onclick = () => {
      state.selectedCount = n;
      document.querySelectorAll('.count-option').forEach(el => el.classList.remove('selected'));
      b.classList.add('selected');
    };
    g.appendChild(b);
  }
}

function createRoom() {
  if (!ensureProfile()) return;
  const roomName = document.getElementById('roomName').value.trim();
  if (!roomName) { toast('กรุณาใส่ชื่อห้อง', 'error'); return; }
  const password = document.getElementById('roomPassword').value;
  closeModal('modal-createRoom');
  socket.emit('createRoom', {
    roomName, password,
    maxPlayers: state.selectedCount,
    playerName: state.myName,
    avatar: state.myAvatar,
  });
}

function joinRoom(roomId, hasPassword) {
  if (!ensureProfile()) return;
  if (hasPassword) {
    state.pendingJoinRoom = roomId;
    document.getElementById('modal-password').classList.remove('hidden');
  } else {
    doJoinRoom(roomId, '');
  }
}

function submitJoinPassword() {
  const pw = document.getElementById('joinPassword').value;
  closeModal('modal-password');
  doJoinRoom(state.pendingJoinRoom, pw);
}

function doJoinRoom(roomId, password) {
  socket.emit('joinRoom', {
    roomId, password,
    playerName: state.myName,
    avatar: state.myAvatar,
  });
}

function leaveRoom() {
  location.reload();
}

function copyRoomCode() {
  const code = document.getElementById('waitingRoomCode').textContent;
  navigator.clipboard.writeText(code).then(() => toast('คัดลอกรหัสห้องแล้ว ✓', 'success'));
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── Waiting Room ─────────────────────────────────────────────────────────────
function renderWaitingRoom(data) {
  state.currentRoom = data.roomId;
  state.isHost = data.isHost;
  state.players = data.players;

  document.getElementById('waitingRoomName').textContent = data.roomName || 'ห้อง';
  document.getElementById('waitingRoomCode').textContent = data.roomId;
  document.getElementById('waitingSlotInfo').textContent = `${data.players.length} / ${data.maxPlayers} ผู้เล่น`;

  const slotsEl = document.getElementById('waitingSlots');
  slotsEl.innerHTML = '';
  for (let i = 0; i < data.maxPlayers; i++) {
    const p = data.players[i];
    const slot = document.createElement('div');
    slot.className = 'player-slot ' + (p ? 'filled' : 'empty');
    if (p) {
      const isHost = data.isHost && p.id === socket.id;
      slot.innerHTML = `${isHost || p.id === data.hostId ? '<span class="slot-host-badge">HOST</span>' : ''} <span class="slot-avatar">${p.avatar}</span> <span class="slot-name">${p.name}</span>`;
    } else {
      slot.innerHTML = '<span class="slot-ghost">👤</span>';
    }
    slotsEl.appendChild(slot);
  }

  const canStart = data.players.length === data.maxPlayers;
  document.getElementById('btnStartGame').classList.toggle('hidden', !data.isHost);
  document.getElementById('btnStartGame').disabled = !canStart;
  document.getElementById('btnReady').classList.toggle('hidden', data.isHost);
}

function startGame() {
  socket.emit('startGame');
}

function toggleReady() {
  socket.emit('playerReady');
  const btn = document.getElementById('btnReady');
  btn.textContent = '⏳ รอผู้เล่นอื่น…';
  btn.disabled = true;
}

// ─── Card Selection ────────────────────────────────────────────────────────────
function showCardSpread(cardCount) {
  const spread = document.getElementById('cardSpread');
  spread.classList.remove('hidden');
  spread.innerHTML = '';
  document.getElementById('cardSelectionStatus').textContent = 'เลือกการ์ดของคุณ!';

  for (let i = 0; i < cardCount; i++) {
    const card = document.createElement('div');
    card.className = 'role-card';
    const idx = i;
    card.innerHTML = `<div class="card-back">🌕</div>`;
    card.onclick = () => {
      spread.querySelectorAll('.role-card').forEach(c => c.style.pointerEvents = 'none');
      card.style.transform = 'translateY(-20px) rotateY(180deg)';
      setTimeout(() => socket.emit('selectCard', { cardIndex: idx }), 300);
    };
    spread.appendChild(card);
  }
}

function showRoleReveal(role) {
  document.getElementById('cardSpread').classList.add('hidden');
  const ri = ROLE_INFO[role] || { icon: '❓', name: role, desc: '' };
  document.getElementById('roleIcon').textContent = ri.icon;
  document.getElementById('roleName').textContent = ri.name;
  document.getElementById('roleDesc').textContent = ri.desc;
  document.getElementById('roleRevealPanel').classList.remove('hidden');
  state.role = role;
}

function playerReady() {
  socket.emit('playerReady');
  document.getElementById('roleRevealPanel').querySelector('button').disabled = true;
  document.getElementById('roleRevealPanel').querySelector('button').textContent = '⏳ รอผู้เล่นอื่น…';
}

// ─── Game Board ────────────────────────────────────────────────────────────────
function renderGameBoard(players, phase) {
  state.players = players;
  const circle = document.getElementById('playerCircle');
  circle.innerHTML = '';

  const n = players.length;
  const cx = 50, cy = 50, r = 41;

  players.forEach((p, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    const token = document.createElement('div');
    token.className = 'player-token' + (p.alive ? '' : ' dead');
    token.id = `token-${p.id}`;
    token.style.left = `${x}%`;
    token.style.top = `${y}%`;
    token.dataset.playerId = p.id;

    const isMe = p.id === socket.id;
    token.innerHTML = `
      <div class="token-avatar-wrap">
        <div class="token-avatar">${p.avatar}</div>
        ${isMe ? '<div class="token-you-badge">คุณ</div>' : ''}
      </div>
      <div class="token-name">${p.name}</div>
    `;
    circle.appendChild(token);
  });
}

function setPhaseUI(phase) {
  const badge = document.getElementById('phaseBadge');
  const night = document.getElementById('nightOverlay');
  const day   = document.getElementById('dayOverlay');

  if (phase === 'night') {
    badge.textContent = '🌙 กลางคืน';
    night.classList.remove('hidden');
    day.classList.add('hidden');
  } else if (phase === 'day' || phase === 'voting') {
    badge.textContent = phase === 'voting' ? '🗳️ โหวต' : '☀️ กลางวัน';
    night.classList.add('hidden');
    day.classList.remove('hidden');
  }
}

function setRoundBadge(r) {
  document.getElementById('roundBadge').textContent = `รอบที่ ${r}`;
}

function makeTokensClickable(callback, excludeId = null) {
  document.querySelectorAll('.player-token').forEach(t => {
    const pid = t.dataset.playerId;
    const player = state.players.find(p => p.id === pid);
    if (!player || !player.alive || pid === excludeId) return;
    t.classList.add('clickable');
    t.onclick = () => {
      document.querySelectorAll('.player-token').forEach(tt => tt.classList.remove('vote-target'));
      t.classList.add('vote-target');
      callback(pid);
    };
  });
}

function clearTokenClickable() {
  document.querySelectorAll('.player-token').forEach(t => {
    t.classList.remove('clickable', 'vote-target');
    t.onclick = null;
  });
}

function highlightWolves(wolfIds) {
  wolfIds.forEach(wid => {
    const t = document.getElementById(`token-${wid}`);
    if (t) t.classList.add('wolf-glow');
  });
}

// ─── Action Panel ─────────────────────────────────────────────────────────────
function setActionPanel(html) {
  document.getElementById('actionPanel').innerHTML = html;
}

function showDayPanel() {
  const me = state.players.find(p => p.id === socket.id);
  const isAlive = me && me.alive;
  if (state.isHost) {
    setActionPanel(`<div class="action-title">☀️ กลางวัน — อภิปราย</div> <div class="action-desc">พูดคุยกัน แล้วเริ่มโหวต</div> <button class="btn btn-primary" onclick="triggerVote()">🗳️ เริ่มโหวต</button>`);
  } else {
    setActionPanel(`<div class="action-title">☀️ กลางวัน — อภิปราย</div> <div class="action-desc">${isAlive ? 'พูดคุยก่อนโหวต รอ host เริ่มโหวต...' : '💀 คุณตายแล้ว — ดูเกมต่อได้'}</div>`);
  }
}

function showVotingPanel() {
  const me = state.players.find(p => p.id === socket.id);
  const isAlive = me && me.alive;
  if (isAlive) {
    setActionPanel(`<div class="action-title">🗳️ โหวตตอนนี้!</div> <div class="action-desc">แตะผู้เล่นที่ต้องการโหวต</div>`);
    makeTokensClickable(pid => {
      state.voteTarget = pid;
      socket.emit('castVote', { targetId: pid });
    }, socket.id);
  } else {
    setActionPanel(`<div class="action-desc">💀 คุณตายแล้ว — ดูการโหวต</div>`);
  }
}

function triggerVote() {
  socket.emit('startVote');
}

// ─── Night turn UI ────────────────────────────────────────────────────────────
function showWerewolfTurnUI(wolfIds) {
  highlightWolves(wolfIds.filter(id => id !== socket.id));
  setActionPanel(`<div class="action-title">🐺 คุณคือหมาป่า!</div> <div class="action-desc">แตะผู้เล่นที่ต้องการฆ่า (ตกลงกับหมาป่าคนอื่น)</div>`);
  makeTokensClickable(pid => {
    socket.emit('werewolfVote', { targetId: pid });
    setActionPanel(`<div class="action-title">🐺 โหวตแล้ว...</div><div class="action-desc">รอหมาป่าคนอื่น...</div>`);
    clearTokenClickable();
    document.querySelector(`#token-${pid}`)?.classList.add('vote-target');
  }, socket.id);
}

function showSeerTurnUI() {
  setActionPanel(`<div class="action-title">👁️ ผู้หยั่งรู้ — เลือกตรวจสอบ</div> <div class="action-desc">แตะผู้เล่นที่ต้องการตรวจสอบ</div>`);
  makeTokensClickable(pid => {
    socket.emit('seerCheck', { targetId: pid });
    clearTokenClickable();
    setActionPanel(`<div class="action-desc">👁️ กำลังตรวจสอบ...</div>`);
  }, socket.id);
}

function showBodyguardTurnUI(lastProtected) {
  setActionPanel(`<div class="action-title">🛡️ บอดี้การ์ด — เลือกปกป้อง</div> <div class="action-desc">แตะผู้เล่นที่ต้องการปกป้อง${lastProtected ? ' (ไม่สามารถปกป้องคนเดิม)' : ''}</div>`);
  makeTokensClickable(pid => {
    socket.emit('bodyguardProtect', { targetId: pid });
    clearTokenClickable();
    setActionPanel(`<div class="action-desc">🛡️ ปกป้องแล้ว รอคืนหน้า...</div>`);
    document.querySelector(`#token-${pid}`)?.classList.add('bodyguard-glow');
  });
  // Disable last protected
  if (lastProtected) {
    const t = document.getElementById(`token-${lastProtected}`);
    if (t) { t.classList.remove('clickable'); t.onclick = null; }
  }
}

function showWaitingForNightAction(role) {
  const labels = {
    werewolf:  '🐺 หมาป่ากำลังเลือกเหยื่อ…',
    seer:      '👁️ ผู้หยั่งรู้กำลังตรวจสอบ…',
    bodyguard: '🛡️ บอดี้การ์ดกำลังปกป้อง…',
  };
  setActionPanel(`<div class="action-title">${labels[role] || 'กำลังดำเนินการ...'}</div> <div class="waiting-indicator">🐾</div>`);
}

// ─── Narrator ─────────────────────────────────────────────────────────────────
function showNarratorBar(text) {
  const bar = document.getElementById('narratorBar');
  const el  = document.getElementById('narratorText');
  el.textContent = text;
  bar.classList.remove('hidden');
  clearTimeout(bar._hideTimer);
  bar._hideTimer = setTimeout(() => bar.classList.add('hidden'), text.length * 80 + 2500);
  Narrator.speak(text);
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer(seconds, onEnd) {
  clearInterval(state.timerInterval);
  state.timerSeconds = seconds;
  const arc = document.getElementById('timerArc');
  const timerText = document.getElementById('timerText');
  const circumference = 100;

  function update() {
    const progress = state.timerSeconds / seconds;
    arc.style.strokeDashoffset = circumference * (1 - progress);
    timerText.textContent = state.timerSeconds;
    if (state.timerSeconds <= 10) arc.classList.add('urgent');
    else arc.classList.remove('urgent');
  }
  update();

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    update();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      if (onEnd) onEnd();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  document.getElementById('timerText').textContent = '–';
  document.getElementById('timerArc').style.strokeDashoffset = 0;
}

// ─── Seer Result ──────────────────────────────────────────────────────────────
function showSeerResult(targetName, isWolf) {
  const overlay = document.getElementById('seerResultOverlay');
  document.getElementById('seerResultIcon').textContent = isWolf ? '🐺' : '👤';
  document.getElementById('seerResultText').innerHTML =
    `<strong>${targetName}</strong> คือ ${isWolf ? '🐺 หมาป่า! <span style="color:#ff6666">ระวังไว้</span>' : '👍 คนดี (ไม่ใช่หมาป่า)'}`;
  overlay.classList.remove('hidden');
  Narrator.speak(isWolf ? `${targetName} คือหมาป่า` : `${targetName} ไม่ใช่หมาป่า`);
}

function closeSeerResult() {
  document.getElementById('seerResultOverlay').classList.add('hidden');
}

// ─── End Game ─────────────────────────────────────────────────────────────────
function showEndGame(winner, roles) {
  showScreen('endgame');
  document.getElementById('endgameTitle').textContent = winner === 'werewolf' ? '🐺 หมาป่าชนะ!' : '🏘️ ชาวบ้านชนะ!';
  document.getElementById('endgameSubtitle').textContent = winner === 'werewolf'
    ? 'ความมืดได้ครองโลก…' : 'แสงสว่างได้ขับไล่ความมืด!';

  Narrator.speak(winner === 'werewolf' ? 'หมาป่าชนะ!' : 'ชาวบ้านชนะ!');

  const grid = document.getElementById('endgameRolesGrid');
  grid.innerHTML = '';
  roles.forEach((p, i) => {
    const ri = ROLE_INFO[p.role] || { icon: '❓', name: p.role };
    const isWolf = p.role === 'werewolf';
    const card = document.createElement('div');
    card.className = `endgame-role-card ${isWolf ? 'wolf' : 'villager-team'}`;
    card.style.animationDelay = `${i * 0.15}s`;
    card.innerHTML = `<div class="endgame-avatar">${p.avatar}</div> <div class="endgame-name">${p.name}</div> <div class="endgame-role">${ri.icon} ${ri.name}</div> <div class="endgame-team">${isWolf ? '🐺' : '👥'}</div>`;
    grid.appendChild(card);
  });
}

function playAgain() {
  socket.emit('playAgain');
}

function backToLobby() {
  location.reload();
}

// ─── Vote Display ─────────────────────────────────────────────────────────────
function updateVoteDisplay(votes) {
  // Count votes per target
  const tally = {};
  Object.values(votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });

  // Clear existing badges
  document.querySelectorAll('.vote-badge').forEach(b => b.remove());

  Object.entries(tally).forEach(([pid, count]) => {
    const tokenWrap = document.querySelector(`#token-${pid} .token-avatar-wrap`);
    if (!tokenWrap) return;
    const badge = document.createElement('div');
    badge.className = 'vote-badge';
    badge.textContent = count;
    tokenWrap.appendChild(badge);
  });
}

// ─── Socket Events ─────────────────────────────────────────────────────────────
socket.on('connect', () => {
  state.myId = socket.id;
  console.log('Connected:', socket.id);
});

socket.on('roomList', (rooms) => {
  const el = document.getElementById('roomList');
  if (!el) return;
  if (!rooms.length) {
    el.innerHTML = '<p class="empty-state">ยังไม่มีห้องที่เปิดอยู่…</p>';
    return;
  }
  el.innerHTML = '';
  rooms.forEach(r => {
    if (r.phase !== 'waiting') return;
    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `<span class="room-item-lock">${r.hasPassword ? '🔒' : '🔓'}</span> <span class="room-item-name">${r.name}</span> <span class="room-item-info">${r.playerCount}/${r.maxPlayers}</span> <button class="btn btn-secondary btn-sm" onclick="joinRoom('${r.id}', ${r.hasPassword})">เข้าร่วม</button>`;
    el.appendChild(item);
  });
  if (!el.children.length) el.innerHTML = '<p class="empty-state">ยังไม่มีห้องที่เปิดอยู่…</p>';
});

socket.on('roomCreated', ({ roomId }) => {
  state.currentRoom = roomId;
});

socket.on('joinError', (msg) => {
  toast(msg, 'error');
});

socket.on('waitingRoom', (data) => {
  showScreen('waiting');
  renderWaitingRoom(data);
  if (data.isHost) state.isHost = true;
});

socket.on('youAreHost', () => {
  state.isHost = true;
  document.getElementById('btnStartGame').classList.remove('hidden');
  document.getElementById('btnReady').classList.add('hidden');
  toast('คุณเป็น HOST คนใหม่', 'success');
});

socket.on('playerJoined', ({ players }) => {
  state.players = players;
  if (document.getElementById('screen-waiting').classList.contains('active')) {
    const savedData = {
      roomId: state.currentRoom,
      roomName: document.getElementById('waitingRoomName').textContent,
      maxPlayers: players.length > 0 ? parseInt(document.getElementById('waitingSlotInfo').textContent.split('/')[1]) : 5,
      players,
      isHost: state.isHost,
    };
    renderWaitingRoom(savedData);
  }
});

socket.on('playerLeft', ({ playerId, players }) => {
  state.players = players;
  toast('ผู้เล่นออกจากห้อง', '');
  const token = document.getElementById(`token-${playerId}`);
  if (token) {
    token.classList.add('dead');
    token.style.opacity = '0.4';
  }
});

socket.on('gameStarting', () => {
  showScreen('countdown');
  Narrator.speak('เกมเริ่มแล้ว');
});

socket.on('countdown', (n) => {
  const el = document.getElementById('countdownNumber');
  el.textContent = n === 0 ? '🐺' : n;
  el.style.animation = 'none';
  setTimeout(() => el.style.animation = '', 10);
  if (n === 0) Narrator.speak('หมาป่า!');
});

socket.on('cardSelectionTurn', ({ pickerId, pickerName }) => {
  showScreen('cardSelection');
  document.getElementById('cardSpread').classList.add('hidden');
  document.getElementById('roleRevealPanel').classList.add('hidden');

  if (pickerId === socket.id) {
    // My turn — wait for 'yourCardTurn'
    document.getElementById('cardSelectionStatus').innerHTML =
      `<div style="color:var(--gold);font-family:var(--font-head)">ถึงตาคุณเลือกการ์ด!</div>`;
  } else {
    document.getElementById('cardSelectionStatus').innerHTML =
      `<div>⏳ รอ <strong style="color:var(--gold)">${pickerName}</strong> เลือกการ์ด...</div> <div class="waiting-indicator">🐾</div>`;
  }
});

socket.on('yourCardTurn', ({ cardCount }) => {
  showCardSpread(cardCount);
});

socket.on('cardFlipped', ({ role }) => {
  showRoleReveal(role);
});

socket.on('allCardsSelected', () => {
  // All cards selected, showing role, waiting for everyone to be ready
});

socket.on('roleReveal', ({ role }) => {
  state.role = role;
  showRoleReveal(role);
});

socket.on('phaseChange', ({ phase, round, killed, players }) => {
  if (players) {
    state.players = players;
    renderGameBoard(players, phase);
  }
  showScreen('game');
  setPhaseUI(phase);
  if (round) setRoundBadge(round);
  state.phase = phase;

  if (phase === 'day') {
    if (killed) {
      const victim = players.find(p => p.id === killed);
      if (victim) {
        showNarratorBar(`รุ่งอรุณมาถึง... ${victim.name} ถูกพบว่าเสียชีวิตในคืนนี้`);
        const t = document.getElementById(`token-${killed}`);
        if (t) {
          t.classList.add('dead');
          t.classList.add('skull-pop');
        }
        // Screen shake
        document.body.classList.add('howl-shake');
        setTimeout(() => document.body.classList.remove('howl-shake'), 800);
      }
    } else {
      showNarratorBar('คืนนี้ไม่มีใครตาย ปาฏิหาริย์เกิดขึ้น');
    }
    setTimeout(() => showDayPanel(), 3000);
    startTimer(60, () => { if (state.phase === 'day' && state.isHost) triggerVote(); });
  }

  if (phase === 'night') {
    stopTimer();
    setActionPanel(`<div class="action-title">🌙 กลางคืน...</div><div class="action-desc">ทุกคนหลับตา</div>`);
  }
});

socket.on('nightStep', ({ step }) => {
  const myRole = state.role;
  clearTokenClickable();

  if (step === 'werewolf') {
    if (myRole === 'werewolf') {
      // Wait for werewolfReveal
      setActionPanel(`<div class="action-title">🐺 หมาป่าตื่นแล้ว</div><div class="action-desc">กำลังรับข้อมูล...</div>`);
    } else {
      showWaitingForNightAction('werewolf');
    }
  } else if (step === 'seer') {
    if (myRole === 'seer') showSeerTurnUI();
    else showWaitingForNightAction('seer');
  } else if (step === 'bodyguard') {
    if (myRole === 'bodyguard') {
      // Wait for yourTurn with lastProtected
      setActionPanel(`<div class="action-desc">🛡️ รับข้อมูลบอดี้การ์ด...</div>`);
    } else {
      showWaitingForNightAction('bodyguard');
    }
  } else if (step === 'resolve') {
    setActionPanel(`<div class="action-title">🌙 กลางคืนสิ้นสุด</div><div class="action-desc">รุ่งอรุณกำลังมาถึง...</div>`);
  }
});

socket.on('werewolfReveal', (wolfIds) => {
  showWerewolfTurnUI(wolfIds);
});

socket.on('werewolfVoteUpdate', ({ votes }) => {
  const myVote = votes[socket.id];
  if (myVote) {
    setActionPanel(`<div class="action-title">🐺 โหวตแล้ว</div><div class="action-desc">รอหมาป่าคนอื่น...</div>`);
  }
  // Update visual target
  updateVoteDisplay(votes);
});

socket.on('yourTurn', ({ action, lastProtected }) => {
  if (action === 'seer') showSeerTurnUI();
  else if (action === 'bodyguard') showBodyguardTurnUI(lastProtected);
});

socket.on('seerResult', ({ targetId, isWolf, targetName }) => {
  showSeerResult(targetName, isWolf);
});

socket.on('bodyguardError', (msg) => {
  toast(msg, 'error');
  // Re-show bodyguard UI — they need to pick again
  showBodyguardTurnUI(null);
});

socket.on('narratorSpeak', (text) => {
  showNarratorBar(text);
});

socket.on('votingOpen', ({ players }) => {
  state.players = players;
  renderGameBoard(players, 'voting');
  setPhaseUI('voting');
  state.phase = 'voting';
  stopTimer();
  showVotingPanel();
  startTimer(30, () => {});
  showNarratorBar('ถึงเวลาโหวตแล้ว');
});

socket.on('voteUpdate', ({ votes }) => {
  state.votes = votes;
  updateVoteDisplay(votes);
});

socket.on('eliminationResult', ({ eliminated, players, tally }) => {
  state.players = players;
  clearTokenClickable();
  stopTimer();
  renderGameBoard(players, 'day');

  if (eliminated) {
    const victim = players.find(p => p.id === eliminated) || state.players.find(p => p.id === eliminated);
    const name = victim ? victim.name : 'ผู้เล่น';
    toast(`💀 ${name} ถูกโหวตออก!`, 'error');
    showNarratorBar(`${name} ถูกโหวตออกจากหมู่บ้าน`);
    const t = document.getElementById(`token-${eliminated}`);
    if (t) { t.classList.add('dead', 'skull-pop'); }
  } else {
    toast('🤝 คะแนนเท่ากัน — ไม่มีใครถูกโหวตออก', '');
    showNarratorBar('คะแนนเท่ากัน ไม่มีใครถูกขับไล่');
  }
  setActionPanel(`<div class="action-desc">🌙 กลางคืนกำลังมา...</div>`);
});

socket.on('gameOver', ({ winner, roles }) => {
  stopTimer();
  Narrator.clearQueue();
  setTimeout(() => showEndGame(winner, roles), 2000);
});

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  initStars();
  loadProfile();
  initProfile();
  showScreen('lobby');
})();
