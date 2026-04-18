/* ═══════════════════════════════════════════════════════
   NEON CHASE — game.js v3.0
   3D Perspective Street Runner
   Features: pseudo-3D road, sprite scaling, particles,
   combo system, powerups, lives, sound, mobile controls
═══════════════════════════════════════════════════════ */

'use strict';

// ── Canvas Setup ─────────────────────────────────────
const canvas = document.getElementById('gc');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Constants ────────────────────────────────────────
const LANES      = 3;
const MAX_HITS   = 10;
const MAX_LIVES  = 3;
const HORIZON_Y  = 0.38;   // fraction of canvas height
const CAM_DEPTH  = 0.84;   // perspective depth (0–1)
const ROAD_W     = 0.62;   // road width fraction at bottom
const PLAYER_Z   = 0.92;   // player depth position (0=horizon, 1=bottom)
const THIEF_Z    = 0.15;   // thief depth position

// ── Asset loader ─────────────────────────────────────
const assets = {};
const assetList = [
  { key: 'thief', src: 'thief.png' },
  { key: 'gun',   src: 'gun.png'   },
];
let assetsReady = false;
let assetsLoaded = 0;
assetList.forEach(({ key, src }) => {
  const img = new Image();
  img.onload  = () => { assetsLoaded++; if (assetsLoaded === assetList.length) assetsReady = true; };
  img.onerror = () => { assetsLoaded++; if (assetsLoaded === assetList.length) assetsReady = true; };
  img.src = src;
  assets[key] = img;
});

// ── Audio ─────────────────────────────────────────────
let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq, type, dur, vol = 0.12) {
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.start(); o.stop(a.currentTime + dur);
  } catch (_) {}
}
const sfx = {
  shoot:  () => beep(900, 'square', 0.07, 0.07),
  hit:    () => { beep(260, 'sawtooth', 0.12, 0.2); beep(520, 'sine', 0.08, 0.12); },
  crash:  () => beep(60, 'sawtooth', 0.45, 0.28),
  power:  () => { beep(440,'sine',0.05,0.1); setTimeout(()=>beep(660,'sine',0.05,0.12),70); setTimeout(()=>beep(880,'sine',0.12,0.12),140); },
  combo:  () => beep(1200, 'sine', 0.1, 0.15),
};

// ── 3D Projection helpers ──────────────────────────────
// Returns {x, y, scale} for a world-z position (0=horizon, 1=bottom)
// laneIndex: 0,1,2  | z: depth fraction
function project(laneIndex, z) {
  const W  = canvas.width;
  const H  = canvas.height;
  const HY = H * HORIZON_Y;
  const BY = H;                         // bottom y
  const totalH = BY - HY;

  const yScreen  = HY + totalH * z;
  const scale    = z * CAM_DEPTH + (1 - CAM_DEPTH) * 0.02;

  const roadHalfAtBottom = W * ROAD_W * 0.5;
  const roadHalfNow      = roadHalfAtBottom * scale;
  const roadCX           = W * 0.5;

  // Lane centers: -1, 0, +1 relative to road center
  const offsets = [-1, 0, 1];
  const laneOff = offsets[laneIndex] * (roadHalfNow / (LANES / 2)) * (2 / LANES);
  const x = roadCX + laneOff;
  return { x, y: yScreen, scale };
}

// Road edge x at depth z
function roadEdge(z, side) { // side: -1 or +1
  const W  = canvas.width;
  const H  = canvas.height;
  const HY = H * HORIZON_Y;
  const BY = H;
  const scale   = z * CAM_DEPTH + (1 - CAM_DEPTH) * 0.02;
  const roadHalf = (W * ROAD_W * 0.5) * scale;
  return W * 0.5 + side * roadHalf;
}

// ── Game State ───────────────────────────────────────
const G = {
  running: false,
  frame: 0,
  score: 0,
  hits: 0,
  lives: MAX_LIVES,
  level: 1,
  speed: 1.0,         // road scroll speed multiplier

  playerLane: 1,
  playerShootTimer: 0,
  playerHitFlash: 0,
  shieldActive: false,
  shieldTimer: 0,
  rapidActive: false,
  rapidTimer: 0,

  thiefLane: 1,
  thiefHitFlash: 0,
  thiefLaneTimer: 60,

  bullets:   [],
  obstacles: [],
  powerups:  [],
  particles: [],

  roadSegments: [],   // scrolling road stripes
  bgStars: [],

  combo: 0,
  comboTimer: 0,

  flashTimer: 0,
  flashColor: 'rgba(255,0,0,0.15)',

  afId: null,
};

// ── Road segments (stripes) ───────────────────────────
function initRoad() {
  G.roadSegments = [];
  for (let i = 0; i < 20; i++) {
    G.roadSegments.push({ t: i / 20 }); // t=0 horizon, t=1 bottom
  }
}

// ── Stars ─────────────────────────────────────────────
function initStars() {
  G.bgStars = [];
  for (let i = 0; i < 80; i++) {
    G.bgStars.push({
      x: Math.random(),
      y: Math.random() * HORIZON_Y,
      r: Math.random() * 1.4 + 0.3,
      sp: Math.random() * 0.0002 + 0.00005,
    });
  }
}

// ── Draw Road ─────────────────────────────────────────
function drawRoad() {
  const W = canvas.width;
  const H = canvas.height;
  const HY = H * HORIZON_Y;

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, HY);
  sky.addColorStop(0, '#050710');
  sky.addColorStop(1, '#0d1230');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HY);

  // Stars
  G.bgStars.forEach(s => {
    s.x += s.sp;
    if (s.x > 1) s.x = 0;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.r * 0.25})`;
    ctx.fill();
  });

  // Distant city glow
  const glow = ctx.createRadialGradient(W * 0.5, HY, 0, W * 0.5, HY, W * 0.6);
  glow.addColorStop(0, 'rgba(0,150,255,0.12)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, HY * 1.2);

  // Road surface
  const roadGrad = ctx.createLinearGradient(0, HY, 0, H);
  roadGrad.addColorStop(0, '#0b0e22');
  roadGrad.addColorStop(1, '#12152e');
  const lX = roadEdge(1, -1), rX = roadEdge(1, 1);
  const lHX = roadEdge(0.001, -1), rHX = roadEdge(0.001, 1);
  ctx.beginPath();
  ctx.moveTo(lHX, HY); ctx.lineTo(rHX, HY);
  ctx.lineTo(rX, H); ctx.lineTo(lX, H);
  ctx.closePath();
  ctx.fillStyle = roadGrad;
  ctx.fill();

  // Road edge lines (glowing)
  for (const side of [-1, 1]) {
    const color = side === -1 ? '#00f2ff' : '#ff00ea';
    ctx.shadowBlur = 12; ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(roadEdge(0.001, side), HY);
    ctx.lineTo(roadEdge(1, side), H);
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  // Lane dividers (dashed, scrolling)
  const scroll = (G.frame * G.speed * 0.018) % (1 / 20);
  for (let lane = 1; lane < LANES; lane++) {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,242,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Draw 15 dashes
    for (let seg = 0; seg < 20; seg++) {
      const t0 = (seg / 20 + scroll) % 1;
      const t1 = ((seg + 0.45) / 20 + scroll) % 1;
      if (t0 > HORIZON_Y * 0.1 && t1 < 1) {
        const p0 = project(lane - 0.5, t0); // between lanes
        const p1 = project(lane - 0.5, t1);
        // use raw road position instead
        const x0 = W * 0.5 + (lane / LANES - 0.5) * 2 * roadEdge(t0, 1) * (lane === 1 ? 0 : 1);
        const y0 = HY + (H - HY) * t0;
        const x1 = W * 0.5 + (lane / LANES - 0.5) * 2 * roadEdge(t1, 1) * (lane === 1 ? 0 : 1);
        const y1 = HY + (H - HY) * t1;
        // Simpler: just interpolate edge * fraction
        const ex0 = roadEdge(t0, 1);
        const ex1 = roadEdge(t1, 1);
        const laneF = lane / LANES * 2 - 1; // -0.33 or +0.33
        ctx.moveTo(W * 0.5 + laneF * ex0, y0);
        ctx.lineTo(W * 0.5 + laneF * ex1, y1);
      }
    }
    ctx.stroke();
  }

  // Road center line
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, HY); ctx.lineTo(W * 0.5, H);
  ctx.stroke();
}

// ── Draw Sprite (player or thief) ─────────────────────
function drawSprite(laneIndex, z, isPlayer, hitFlash) {
  const { x, y, scale } = project(laneIndex, z);
  const baseW = isPlayer ? 90 : 100;
  const baseH = isPlayer ? 130 : 140;
  const w = baseW * scale;
  const h = baseH * scale;
  const sx = x - w / 2;
  const sy = y - h;

  ctx.save();

  // Hit flash
  if (hitFlash > 0) ctx.globalAlpha = 0.4 + 0.6 * (Math.sin(G.frame * 1.2) * 0.5 + 0.5);

  // Shadow on road
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = isPlayer ? 'rgba(0,242,255,0.4)' : 'rgba(255,0,80,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.4, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = hitFlash > 0 ? (0.4 + 0.6 * (Math.sin(G.frame * 1.2) * 0.5 + 0.5)) : 1;

  const img = isPlayer ? assets.gun : assets.thief;
  const imgReady = img && img.complete && img.naturalWidth > 0;

  if (imgReady) {
    // Draw actual image
    if (isPlayer && G.shieldActive) {
      // Shield glow around player
      ctx.shadowBlur = 24 * scale;
      ctx.shadowColor = '#00ff9d';
    }
    ctx.drawImage(img, sx, sy, w, h);
    ctx.shadowBlur = 0;
  } else {
    // Fallback: procedural character
    drawProceduralSprite(x, y, w, h, isPlayer, scale);
  }

  // Shield bubble
  if (isPlayer && G.shieldActive) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#00ff9d';
    ctx.lineWidth = 2 * scale;
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(G.frame * 0.12);
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.45, w * 0.6, h * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Thief lane arrow (helps player know which lane)
  if (!isPlayer) {
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 10 * scale; ctx.shadowColor = '#ff0055';
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(G.frame * 0.1);
    const aw = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(x, y + 6 * scale);
    ctx.lineTo(x - aw, y + 18 * scale);
    ctx.lineTo(x + aw, y + 18 * scale);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawProceduralSprite(x, y, w, h, isPlayer, scale) {
  if (isPlayer) {
    // Body
    ctx.fillStyle = G.shieldActive ? '#00ff9d' : '#00f2ff';
    ctx.shadowBlur = 16 * scale; ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.roundRect(x - w * 0.35, y - h * 0.9, w * 0.7, h * 0.75, 6 * scale);
    ctx.fill();
    // Barrel
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 3 * scale, y - h, 6 * scale, 22 * scale);
    // Cockpit
    ctx.fillStyle = 'rgba(0,180,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.55, w * 0.28, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    // Thief body
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 14 * scale; ctx.shadowColor = '#ff0055';
    ctx.beginPath();
    ctx.roundRect(x - w * 0.38, y - h * 0.85, w * 0.76, h * 0.7, 6 * scale);
    ctx.fill();
    // Face
    ctx.fillStyle = '#ff88bb';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.55, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ── Obstacle ──────────────────────────────────────────
function drawObstacle(obs) {
  const { x, y, scale } = project(obs.lane, obs.z);
  const w = 56 * scale;
  const h = 46 * scale;
  const sx = x - w / 2;
  const sy = y - h;

  ctx.save();
  ctx.translate(x, y - h * 0.5);
  ctx.rotate(obs.spin);

  ctx.fillStyle = '#ff00ea';
  ctx.shadowBlur = 18 * scale; ctx.shadowColor = '#ff00ea';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 5 * scale);
  ctx.fill();

  // Inner glow
  ctx.fillStyle = 'rgba(255,0,234,0.3)';
  ctx.beginPath();
  ctx.roundRect(-w * 0.35, -h * 0.35, w * 0.7, h * 0.7, 3 * scale);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(10, 18 * scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚠', 0, 0);

  ctx.restore();

  // Road shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#ff00ea';
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * scale, w * 0.4, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Power-up ─────────────────────────────────────────
const POWERUP_COLORS = { shield: '#00ff9d', rapid: '#ffe600', life: '#ff4488' };
const POWERUP_ICONS  = { shield: 'S', rapid: 'R', life: '♥' };

function drawPowerup(p) {
  const { x, y, scale } = project(p.lane, p.z);
  const size = 44 * scale;
  const sx = x - size / 2;
  const sy = y - size;
  const color = POWERUP_COLORS[p.type];

  ctx.save();
  ctx.translate(x, y - size * 0.5);
  ctx.rotate(p.spin);

  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * scale;
  ctx.shadowBlur = 16 * scale; ctx.shadowColor = color;
  ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(G.frame * 0.08));
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
  ctx.stroke();

  // Inner fill
  ctx.globalAlpha = 1;
  ctx.fillStyle = color + '22';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(8, 16 * scale)}px 'Orbitron', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(POWERUP_ICONS[p.type], 0, 0);

  ctx.restore();
}

// ── Bullet ────────────────────────────────────────────
function drawBullets() {
  G.bullets.forEach(b => {
    const { x, y, scale } = project(b.lane, b.z);
    const w = 8 * scale, h = 18 * scale;

    // Trail
    b.trail.forEach((t, i) => {
      const ts = project(t.lane, t.z);
      const a = (i / b.trail.length) * 0.5;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#00f2ff';
      ctx.fillRect(ts.x - w * 0.4, ts.y - h * 0.4, w * 0.8, h * 0.8);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 12 * scale; ctx.shadowColor = '#00f2ff';
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.shadowBlur = 0;
  });
}

// ── Particles ─────────────────────────────────────────
function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 1.5;
    G.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: Math.random() * 4 + 1.5,
      color,
      life: 1,
      decay: Math.random() * 0.02 + 0.025,
    });
  }
}

function updateParticles() {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x  += p.vx; p.y += p.vy;
    p.vy += 0.12;
    p.r  *= 0.96;
    p.life -= p.decay;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
}

function drawParticles() {
  G.particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6; ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ── Collision (screen-space rect) ────────────────────
function screenRect(laneIndex, z, baseW, baseH) {
  const { x, y, scale } = project(laneIndex, z);
  const w = baseW * scale;
  const h = baseH * scale;
  return { x: x - w / 2, y: y - h, w, h, cx: x, cy: y - h * 0.5 };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// ── HUD updater ───────────────────────────────────────
function updateHUD() {
  document.getElementById('hitBar').style.width   = `${(G.hits / MAX_HITS) * 100}%`;
  document.getElementById('hitCount').textContent = `${G.hits} / ${MAX_HITS}`;
  document.getElementById('scoreVal').textContent  = String(Math.floor(G.score)).padStart(6, '0');
  document.getElementById('levelNum').textContent  = String(G.level).padStart(2, '0');

  const row = document.getElementById('livesRow');
  row.innerHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    const s = document.createElement('span');
    s.textContent = i < G.lives ? '❤' : '🖤';
    row.appendChild(s);
  }
}

// ── Status banner ─────────────────────────────────────
let bannerTimeout = null;
function showBanner(msg) {
  const el = document.getElementById('statusBanner');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.classList.remove('show'), 1100);
}

// ── Spawn helpers ─────────────────────────────────────
function spawnObstacle() {
  G.obstacles.push({
    lane: Math.floor(Math.random() * LANES),
    z: 0.02,        // start near horizon
    spin: 0,
  });
}

function spawnPowerup() {
  const types = ['shield', 'rapid', 'life'];
  G.powerups.push({
    lane: Math.floor(Math.random() * LANES),
    z: 0.02,
    type: types[Math.floor(Math.random() * types.length)],
    spin: 0,
  });
}

function spawnBullet() {
  G.bullets.push({
    lane: G.playerLane,
    z: PLAYER_Z - 0.04,
    trail: [],
  });
  sfx.shoot();
  G.playerShootTimer = G.rapidActive ? 14 : 26;
}

// ── Game Logic ────────────────────────────────────────
function updateLogic() {
  G.frame++;
  G.score += 0.13 + (G.level - 1) * 0.04 + G.combo * 0.015;
  G.level = 1 + Math.floor(G.hits / 3);
  G.speed = 1.0 + (G.level - 1) * 0.12;

  // Timers
  if (G.shieldTimer  > 0) { G.shieldTimer--;  } else { G.shieldActive = false; }
  if (G.rapidTimer   > 0) { G.rapidTimer--;   } else { G.rapidActive  = false; }
  if (G.comboTimer   > 0) { G.comboTimer--;   } else { G.combo = 0; }
  if (G.flashTimer   > 0) { G.flashTimer--;   }
  if (G.playerHitFlash > 0) G.playerHitFlash--;
  if (G.thiefHitFlash  > 0) G.thiefHitFlash--;

  // Player shoot
  if (G.playerShootTimer > 0) G.playerShootTimer--;
  if (G.playerLane === G.thiefLane && G.playerShootTimer <= 0) {
    spawnBullet();
  }

  // Thief AI — lane change
  G.thiefLaneTimer--;
  if (G.thiefLaneTimer <= 0) {
    G.thiefLane = Math.floor(Math.random() * LANES);
    G.thiefLaneTimer = Math.max(30, 80 - G.level * 7);
  }

  // Bullets (move toward horizon)
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.trail.push({ lane: b.lane, z: b.z });
    if (b.trail.length > 6) b.trail.shift();
    b.z -= 0.028 + G.level * 0.002;

    // Hit thief?
    const br = screenRect(b.lane, Math.max(b.z, 0.01), 12, 22);
    const tr = screenRect(G.thiefLane, THIEF_Z, 100, 140);
    if (b.lane === G.thiefLane && rectsOverlap(br, tr)) {
      G.hits++;
      G.combo++;
      G.comboTimer = 100;
      const bonus = G.combo > 1 ? G.combo * 6 : 0;
      G.score += 10 + bonus;
      G.thiefHitFlash = 14;

      const tp = project(G.thiefLane, THIEF_Z);
      spawnParticles(tp.x, tp.y - 50, '#ff0055', 18);

      G.flashTimer = 6; G.flashColor = 'rgba(255,0,80,0.12)';
      sfx.hit();
      if (G.combo > 1) { sfx.combo(); showBanner(`COMBO ×${G.combo}  +${bonus}`); }

      G.bullets.splice(i, 1);
      updateHUD();
      if (G.hits >= MAX_HITS) { endGame(true); return; }
      continue;
    }

    // Off screen
    if (b.z < -0.05) G.bullets.splice(i, 1);
  }

  // Obstacles
  const obsInterval = Math.max(52, 95 - G.level * 8);
  if (G.frame % obsInterval === 0) spawnObstacle();

  for (let i = G.obstacles.length - 1; i >= 0; i--) {
    const o = G.obstacles[i];
    o.z += (0.008 + G.level * 0.0015) * G.speed;
    o.spin += 0.04;

    // Past player?
    if (o.z > 1.05) { G.obstacles.splice(i, 1); continue; }

    // Collision with player
    if (o.lane === G.playerLane && Math.abs(o.z - PLAYER_Z) < 0.06) {
      const pp = project(G.playerLane, PLAYER_Z);
      if (G.shieldActive) {
        G.shieldActive = false; G.shieldTimer = 0;
        spawnParticles(pp.x, pp.y - 80, '#00ff9d', 18);
        G.obstacles.splice(i, 1);
        sfx.power();
        showBanner('SHIELD BLOCKED!');
      } else {
        G.lives--;
        G.playerHitFlash = 20;
        G.flashTimer = 18; G.flashColor = 'rgba(255,0,0,0.2)';
        spawnParticles(pp.x, pp.y - 80, '#ff3333', 24);
        sfx.crash();
        G.obstacles.splice(i, 1);
        updateHUD();
        if (G.lives <= 0) { endGame(false); return; }
      }
      continue;
    }
  }

  // Powerups
  if (G.frame % 200 === 0) spawnPowerup();

  for (let i = G.powerups.length - 1; i >= 0; i--) {
    const p = G.powerups[i];
    p.z += 0.006 * G.speed;
    p.spin += 0.06;

    if (p.z > 1.1) { G.powerups.splice(i, 1); continue; }

    // Collect?
    if (p.lane === G.playerLane && Math.abs(p.z - PLAYER_Z) < 0.07) {
      sfx.power();
      const pp = project(G.playerLane, PLAYER_Z);
      spawnParticles(pp.x, pp.y - 80, POWERUP_COLORS[p.type], 14);
      if (p.type === 'shield') { G.shieldActive = true; G.shieldTimer = 320; showBanner('⚡ SHIELD ONLINE'); }
      if (p.type === 'rapid')  { G.rapidActive  = true; G.rapidTimer  = 260; showBanner('🔥 RAPID FIRE'); }
      if (p.type === 'life' && G.lives < MAX_LIVES) { G.lives++; updateHUD(); showBanner('❤ EXTRA LIFE'); }
      G.powerups.splice(i, 1);
      continue;
    }
  }

  updateParticles();
}

// ── Draw everything ───────────────────────────────────
function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  drawRoad();

  // Screen flash
  if (G.flashTimer > 0) {
    ctx.fillStyle = G.flashColor;
    ctx.fillRect(0, 0, W, H);
  }

  // Draw objects back-to-front (sorted by z, small z = far)
  // Thief (always near top)
  drawSprite(G.thiefLane, THIEF_Z, false, G.thiefHitFlash);

  // Obstacles, powerups, bullets sorted by z
  const allObjects = [
    ...G.obstacles.map(o => ({ type: 'obs',    z: o.z, data: o })),
    ...G.powerups.map( p => ({ type: 'pow',    z: p.z, data: p })),
    ...G.bullets.map(  b => ({ type: 'bullet', z: b.z, data: b })),
  ].sort((a, b) => a.z - b.z);

  allObjects.forEach(obj => {
    if (obj.type === 'obs')    drawObstacle(obj.data);
    if (obj.type === 'pow')    drawPowerup(obj.data);
    if (obj.type === 'bullet') {/* drawn separately below */}
  });

  drawBullets();
  drawParticles();

  // Player (always at front)
  drawSprite(G.playerLane, PLAYER_Z, true, G.playerHitFlash);

  // Combo text on canvas
  if (G.combo > 1 && G.comboTimer > 0) {
    const alpha = Math.min(1, G.comboTimer / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffe600';
    ctx.shadowBlur = 14; ctx.shadowColor = '#ffe600';
    ctx.font = `bold ${clamp(18, 24, W * 0.04)}px 'Orbitron', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`×${G.combo} COMBO`, W * 0.5, H * 0.52);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  // Rapid fire indicator
  if (G.rapidActive) {
    ctx.fillStyle = '#ffe600';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ffe600';
    ctx.font = `${clamp(10, 13, W * 0.025)}px 'Orbitron', monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('RAPID', W - 20, H * HORIZON_Y + 20);
    ctx.shadowBlur = 0;
  }
}

function clamp(min, max, val) { return Math.max(min, Math.min(max, val)); }

// ── Main Loop ─────────────────────────────────────────
function loop() {
  if (!G.running) return;
  updateLogic();
  draw();
  G.afId = requestAnimationFrame(loop);
}

// ── End Game ──────────────────────────────────────────
function endGame(success) {
  G.running = false;
  cancelAnimationFrame(G.afId);

  document.getElementById('gameScreen').classList.remove('active');
  const screen = document.getElementById('gameoverScreen');
  screen.classList.add('active');

  if (success) {
    document.getElementById('goBadge').textContent  = 'MISSION COMPLETE';
    document.getElementById('goBadge').style.borderColor = '#00f2ff';
    document.getElementById('goBadge').style.color        = '#00f2ff';
    document.getElementById('goTitle').textContent = 'THIEF CAUGHT';
    document.getElementById('goMsg').textContent   = 'Outstanding work, officer.';
  } else {
    document.getElementById('goBadge').textContent = 'MISSION FAILED';
    document.getElementById('goTitle').textContent = 'ELIMINATED';
    document.getElementById('goMsg').textContent   = 'You ran out of lives.';
  }

  document.getElementById('goStats').innerHTML =
    `SCORE &nbsp; ${String(Math.floor(G.score)).padStart(6, '0')}<br>` +
    `LEVEL &nbsp; ${G.level} &nbsp;·&nbsp; HITS &nbsp; ${G.hits} / ${MAX_HITS}<br>` +
    `BEST COMBO &nbsp; ×${G.combo > 0 ? G.combo : '—'}`;
}

// ── Controls ──────────────────────────────────────────
function moveLeft()  { if (G.running && G.playerLane > 0)          G.playerLane--; }
function moveRight() { if (G.running && G.playerLane < LANES - 1)  G.playerLane++; }

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  { e.preventDefault(); moveLeft(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); moveRight(); }
});

// Touch / mouse for mobile buttons
function addBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
  el.addEventListener('mousedown',  () => fn());
}
addBtn('mLeft',  moveLeft);
addBtn('mRight', moveRight);

// ── Start ─────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', () => {
  // Unlock audio on first interaction
  try { ac().resume(); } catch (_) {}

  // Reset state
  Object.assign(G, {
    running: false, frame: 0, score: 0, hits: 0,
    lives: MAX_LIVES, level: 1, speed: 1.0,
    playerLane: 1, playerShootTimer: 0, playerHitFlash: 0,
    shieldActive: false, shieldTimer: 0,
    rapidActive: false, rapidTimer: 0,
    thiefLane: 1, thiefHitFlash: 0, thiefLaneTimer: 80,
    bullets: [], obstacles: [], powerups: [], particles: [],
    combo: 0, comboTimer: 0,
    flashTimer: 0,
  });

  initRoad();
  initStars();
  updateHUD();

  document.getElementById('startScreen').classList.remove('active');
  document.getElementById('gameScreen').classList.add('active');

  G.running = true;
  loop();
});
