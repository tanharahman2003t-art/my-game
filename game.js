/* ═══════════════════════════════════════════════
   NEON CHASE v4.0 — Complete Rewrite
   Proper pseudo-3D · Fixed lanes · Clean visuals
═══════════════════════════════════════════════ */
'use strict';

const canvas = document.getElementById('gc');
const ctx    = canvas.getContext('2d');

let W, H;
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ── Assets ───────────────────────────────────────
const IMG = { gun: new Image(), thief: new Image() };
IMG.gun.src   = 'gun.png';
IMG.thief.src = 'thief.png';

// ── Audio ────────────────────────────────────────
let AC = null;
function getAC() { return AC || (AC = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(f, t, d, v) {
  try {
    const a=getAC(), o=a.createOscillator(), g=a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type=t||'square'; o.frequency.value=f;
    o.frequency.exponentialRampToValueAtTime(f*0.4, a.currentTime+d);
    g.gain.setValueAtTime(v||0.1, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime+d);
    o.start(); o.stop(a.currentTime+d);
  } catch(e){}
}
const SFX = {
  shoot : function(){ tone(780,'square',0.06,0.08); },
  hit   : function(){ tone(220,'sawtooth',0.15,0.22); setTimeout(function(){ tone(440,'sine',0.08,0.1); },40); },
  crash : function(){ tone(55,'sawtooth',0.5,0.3); },
  power : function(){ tone(440,'sine',0.06,0.12); setTimeout(function(){ tone(660,'sine',0.06,0.12); },80); setTimeout(function(){ tone(880,'sine',0.1,0.12); },160); },
};

// ── 3D Road Config ───────────────────────────────
var CFG = {
  HORIZON : 0.40,
  CAM_H   : 180,
  CAM_D   : 280,
  ROAD_W  : 0.78,
  LANES   : 3,
};

// Project world-z to screen
function project(z) {
  var hy     = H * CFG.HORIZON;
  var scale  = CFG.CAM_D / Math.max(z, 1);
  var screenY = hy + CFG.CAM_H * scale;
  var halfRoad = (W * CFG.ROAD_W * 0.5) * scale;
  return {
    screenY  : Math.min(screenY, H * 0.99),
    scale    : scale,
    roadLeft : W * 0.5 - halfRoad,
    roadRight: W * 0.5 + halfRoad,
  };
}

function laneX(lane, z) {
  var p   = project(z);
  var lw  = (p.roadRight - p.roadLeft) / CFG.LANES;
  return p.roadLeft + lw * (lane + 0.5);
}

// Fixed z positions for player and thief
var PLAYER_Z = 110;
var THIEF_Z  = 880;

// ── State ────────────────────────────────────────
var S = {
  running:false, frame:0, score:0, hits:0, lives:3, level:1,
  playerLane:1, pShootTimer:0, pHitFlash:0,
  shieldOn:false, shieldTimer:0,
  rapidOn:false,  rapidTimer:0,
  thiefLane:1, tHitFlash:0, tLaneTimer:70,
  bullets:[], obstacles:[], powerups:[], particles:[],
  combo:0, comboTimer:0,
  flashTimer:0, flashColor:'rgba(255,0,0,0.15)',
  raf:null,
};

var roadScroll = 0;

// Stars
var STARS = [];
for (var si=0; si<110; si++) {
  STARS.push({ x:Math.random(), y:Math.random()*0.38, r:Math.random()*1.3+0.2, b:Math.random()*0.5+0.3 });
}

// ── Sky ──────────────────────────────────────────
function drawSky() {
  var hy = H * CFG.HORIZON;
  var g  = ctx.createLinearGradient(0,0,0,hy);
  g.addColorStop(0,   '#02030e');
  g.addColorStop(0.65,'#07091c');
  g.addColorStop(1,   '#100a28');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, hy);

  // Purple atmospheric glow at horizon
  var cg = ctx.createRadialGradient(W/2, hy, 0, W/2, hy, W*0.5);
  cg.addColorStop(0, 'rgba(80,0,160,0.38)');
  cg.addColorStop(0.5,'rgba(30,0,80,0.15)');
  cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg;
  ctx.fillRect(0, hy*0.3, W, hy*0.7);

  // Stars
  for (var i=0; i<STARS.length; i++) {
    var s  = STARS[i];
    var tw = Math.sin(S.frame*0.012 + s.x*9)*0.25 + 0.75;
    ctx.beginPath();
    ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,'+(s.b*tw)+')';
    ctx.fill();
  }
}

// ── Road ─────────────────────────────────────────
function drawRoad() {
  var hy   = H * CFG.HORIZON;
  var near = project(PLAYER_Z * 0.35);
  var far  = project(THIEF_Z  * 1.9);

  // Road surface trapezoid
  ctx.beginPath();
  ctx.moveTo(far.roadLeft,  far.screenY);
  ctx.lineTo(far.roadRight, far.screenY);
  ctx.lineTo(near.roadRight, H + 2);
  ctx.lineTo(near.roadLeft,  H + 2);
  ctx.closePath();
  var rg = ctx.createLinearGradient(0, hy, 0, H);
  rg.addColorStop(0,   '#0c0820');
  rg.addColorStop(0.45,'#130b2c');
  rg.addColorStop(1,   '#1c1040');
  ctx.fillStyle = rg;
  ctx.fill();

  // Horizontal grid stripes (scrolling)
  var rowCount = 20;
  roadScroll = (roadScroll + 0.38 * (1 + (S.level-1)*0.12)) % (H / rowCount);
  for (var row = 0; row <= rowCount + 1; row++) {
    var yFrac = ((row / rowCount) + roadScroll / H) % 1.0;
    var sy    = hy + yFrac * (H - hy);
    if (sy < hy || sy > H) continue;
    var denom = sy - hy;
    if (denom < 1) continue;
    var z2 = (CFG.CAM_H * CFG.CAM_D) / denom;
    var p2 = project(z2);
    ctx.beginPath();
    ctx.moveTo(p2.roadLeft,  sy);
    ctx.lineTo(p2.roadRight, sy);
    ctx.strokeStyle = (row % 2 === 0)
      ? 'rgba(0,210,255,0.11)'
      : 'rgba(120,0,255,0.07)';
    ctx.lineWidth = (row % 2 === 0) ? 1 : 0.5;
    ctx.stroke();
  }

  // Lane dividers
  for (var lane = 1; lane < CFG.LANES; lane++) {
    var frac = lane / CFG.LANES;
    var xNear = near.roadLeft + (near.roadRight - near.roadLeft) * frac;
    var xFar  = far.roadLeft  + (far.roadRight  - far.roadLeft)  * frac;

    var ld = ctx.createLinearGradient(0, hy, 0, H);
    ld.addColorStop(0,   'rgba(0,242,255,0.0)');
    ld.addColorStop(0.45,'rgba(0,242,255,0.22)');
    ld.addColorStop(1,   'rgba(0,242,255,0.50)');
    ctx.beginPath();
    ctx.moveTo(xFar,  far.screenY);
    ctx.lineTo(xNear, H);
    ctx.strokeStyle = ld;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Road edge glow lines
  var sides = [['roadLeft','#00f2ff'],['roadRight','#ff00ea']];
  for (var ei=0; ei<sides.length; ei++) {
    var key = sides[ei][0], col = sides[ei][1];
    ctx.save();
    ctx.shadowBlur = 18; ctx.shadowColor = col;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2.5;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(far[key],  far.screenY);
    ctx.lineTo(near[key], H);
    ctx.stroke();
    ctx.restore();
  }

  // Dark shoulders outside road
  ctx.fillStyle = '#06041a';
  ctx.fillRect(0,         hy, near.roadLeft,          H - hy);
  ctx.fillRect(near.roadRight, hy, W - near.roadRight, H - hy);

  // Horizon line
  ctx.save();
  var hlg = ctx.createLinearGradient(0,0,W,0);
  hlg.addColorStop(0,   'transparent');
  hlg.addColorStop(0.25,'#00f2ff');
  hlg.addColorStop(0.75,'#ff00ea');
  hlg.addColorStop(1,   'transparent');
  ctx.strokeStyle = hlg;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke();
  ctx.restore();
}

// ── Sprite ───────────────────────────────────────
function drawSprite(lane, z, isPlayer, hitFlash) {
  var sx = laneX(lane, z);
  var pj = project(z);
  var sc = pj.scale;
  var sy = pj.screenY;

  var baseW = isPlayer ? 78  : 92;
  var baseH = isPlayer ? 118 : 132;
  var sw = baseW * sc;
  var sh = baseH * sc;
  var dx = sx - sw * 0.5;
  var dy = sy - sh;

  ctx.save();

  // Ground shadow
  ctx.globalAlpha = 0.22 * Math.min(1, sc * 1.4);
  ctx.fillStyle = isPlayer ? (S.shieldOn ? '#00ff9d' : '#00ccff') : '#ff0055';
  ctx.beginPath();
  ctx.ellipse(sx, sy + sh*0.015, sw*0.44, sh*0.055, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Hit flash
  if (hitFlash > 0) {
    ctx.globalAlpha = 0.35 + 0.65 * (Math.sin(S.frame * 1.5) * 0.5 + 0.5);
  }

  // Try real image
  var img = isPlayer ? IMG.gun : IMG.thief;
  if (img.complete && img.naturalWidth > 0) {
    if (isPlayer && S.shieldOn) { ctx.shadowBlur = 26*sc; ctx.shadowColor = '#00ff9d'; }
    ctx.drawImage(img, dx, dy, sw, sh);
    ctx.shadowBlur = 0;
  } else {
    drawFallback(sx, sy, sw, sh, isPlayer, sc);
  }

  ctx.globalAlpha = 1;

  // Shield bubble
  if (isPlayer && S.shieldOn) {
    var pulse = 0.55 + 0.45 * Math.sin(S.frame * 0.14);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#00ff9d';
    ctx.lineWidth   = 2.5 * sc;
    ctx.shadowBlur  = 20 * sc;
    ctx.shadowColor = '#00ff9d';
    ctx.beginPath();
    ctx.ellipse(sx, sy - sh*0.44, sw*0.62, sh*0.58, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  // Thief arrow marker
  if (!isPlayer) {
    var asz = 9 * sc;
    var ay  = sy + asz * 0.3;
    ctx.save();
    ctx.fillStyle   = '#ff0055';
    ctx.shadowBlur  = 10 * sc;
    ctx.shadowColor = '#ff0055';
    ctx.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin(S.frame * 0.1));
    ctx.beginPath();
    ctx.moveTo(sx,         ay);
    ctx.lineTo(sx - asz,   ay + asz * 1.6);
    ctx.lineTo(sx + asz,   ay + asz * 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }
}

function drawFallback(cx, botY, w, h, isPlayer, sc) {
  ctx.save();
  if (isPlayer) {
    // Car body
    ctx.fillStyle   = S.shieldOn ? '#00ff9d' : '#00e8ff';
    ctx.shadowBlur  = 22*sc;
    ctx.shadowColor = ctx.fillStyle;
    rr(cx-w*0.38, botY-h*0.78, w*0.76, h*0.65, 8*sc);
    ctx.fill();

    // Cockpit
    ctx.fillStyle  = 'rgba(0,30,80,0.88)';
    ctx.shadowBlur = 0;
    rr(cx-w*0.24, botY-h*0.78, w*0.48, h*0.3, 5*sc);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,242,255,0.5)';
    ctx.lineWidth   = 1 * sc;
    ctx.stroke();

    // Gun barrel
    ctx.fillStyle   = '#ffffffcc';
    ctx.shadowBlur  = 8*sc; ctx.shadowColor = '#fff';
    ctx.fillRect(cx-3*sc, botY-h, 6*sc, h*0.26);

    // Headlights
    ctx.shadowBlur = 10*sc; ctx.shadowColor = '#fff';
    ctx.fillStyle  = '#fff';
    ctx.beginPath(); ctx.arc(cx-w*0.34, botY-h*0.64, 4.5*sc, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+w*0.34, botY-h*0.64, 4.5*sc, 0, Math.PI*2); ctx.fill();

    // Blue underglow
    ctx.fillStyle   = 'rgba(0,230,255,0.25)';
    ctx.shadowBlur  = 20*sc; ctx.shadowColor = '#00e8ff';
    ctx.beginPath(); ctx.ellipse(cx, botY-h*0.07, w*0.48, h*0.07, 0, 0, Math.PI*2); ctx.fill();

  } else {
    // Thief body
    ctx.fillStyle   = '#ee0044';
    ctx.shadowBlur  = 22*sc; ctx.shadowColor = '#ff0055';
    rr(cx-w*0.40, botY-h*0.80, w*0.80, h*0.68, 8*sc);
    ctx.fill();

    // Windshield
    ctx.fillStyle  = 'rgba(50,0,25,0.92)';
    ctx.shadowBlur = 0;
    rr(cx-w*0.26, botY-h*0.80, w*0.52, h*0.32, 5*sc);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,0,80,0.45)';
    ctx.lineWidth   = 1 * sc;
    ctx.stroke();

    // Roof lights
    ctx.fillStyle = '#ff6600'; ctx.shadowBlur=12*sc; ctx.shadowColor='#ff6600';
    ctx.beginPath(); ctx.arc(cx-w*0.14, botY-h*0.85, 5.5*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff0030'; ctx.shadowColor='#ff0030';
    ctx.beginPath(); ctx.arc(cx+w*0.14, botY-h*0.85, 5.5*sc, 0, Math.PI*2); ctx.fill();

    // Red underglow
    ctx.fillStyle   = 'rgba(255,0,60,0.22)';
    ctx.shadowBlur  = 20*sc; ctx.shadowColor = '#ff0055';
    ctx.beginPath(); ctx.ellipse(cx, botY-h*0.07, w*0.48, h*0.07, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

// ── Bullets ───────────────────────────────────────
function drawBullets() {
  for (var i=0; i<S.bullets.length; i++) {
    var b = S.bullets[i];
    // Trail
    for (var ti=0; ti<b.trail.length; ti++) {
      var t  = b.trail[ti];
      var tp = project(t.z);
      var tx2 = laneX(b.lane, t.z);
      var tsc = tp.scale;
      var tw = 7*tsc, th2 = 16*tsc;
      ctx.globalAlpha = (ti/b.trail.length)*0.42;
      ctx.fillStyle = '#00f2ff';
      ctx.fillRect(tx2-tw/2, tp.screenY-th2, tw, th2);
    }
    ctx.globalAlpha = 1;

    var bp = project(b.z);
    var bx = laneX(b.lane, b.z);
    var bsc = bp.scale;
    var bw = 8*bsc, bh = 20*bsc;
    ctx.save();
    ctx.fillStyle   = '#ffffff';
    ctx.shadowBlur  = 16*bsc; ctx.shadowColor = '#00f2ff';
    ctx.fillRect(bx-bw/2, bp.screenY-bh, bw, bh);
    ctx.fillStyle   = '#00f2ff';
    ctx.beginPath(); ctx.arc(bx, bp.screenY-bh, bw/2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Obstacle ──────────────────────────────────────
function drawObstacle(o) {
  var op = project(o.z);
  var ox = laneX(o.lane, o.z);
  var sc = op.scale;
  var ow = 60*sc, oh = 52*sc;

  ctx.save();
  ctx.translate(ox, op.screenY - oh*0.5);
  ctx.rotate(o.spin);

  ctx.fillStyle   = '#c000cc';
  ctx.shadowBlur  = 22*sc; ctx.shadowColor = '#ff00ea';
  rr(-ow/2, -oh/2, ow, oh, 7*sc);
  ctx.fill();

  ctx.fillStyle  = '#ff44ff';
  ctx.shadowBlur = 0;
  rr(-ow*0.3, -oh*0.3, ow*0.6, oh*0.6, 4*sc);
  ctx.fill();

  ctx.fillStyle      = '#ffffff';
  ctx.font           = 'bold '+Math.max(9, Math.round(20*sc))+'px sans-serif';
  ctx.textAlign      = 'center';
  ctx.textBaseline   = 'middle';
  ctx.fillText('!', 0, 0);
  ctx.restore();

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle   = '#ff00ea';
  ctx.beginPath(); ctx.ellipse(ox, op.screenY+3*sc, ow*0.42, 7*sc, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── Power-up ──────────────────────────────────────
var PU_COL  = { shield:'#00ff9d', rapid:'#ffe600', life:'#ff4466' };
var PU_ICON = { shield:'S', rapid:'R', life:'♥' };

function drawPowerup(p) {
  var pp = project(p.z);
  var px = laneX(p.lane, p.z);
  var sc = pp.scale;
  var ps = 48*sc;
  var col = PU_COL[p.type];
  var pulse = 0.7 + 0.3 * Math.abs(Math.sin(S.frame*0.09));

  ctx.save();
  ctx.translate(px, pp.screenY - ps*0.5);
  ctx.rotate(p.spin);

  ctx.strokeStyle = col;
  ctx.lineWidth   = 2.5*sc;
  ctx.shadowBlur  = 22*sc; ctx.shadowColor = col;
  ctx.globalAlpha = pulse;
  ctx.beginPath(); ctx.arc(0, 0, ps*0.5, 0, Math.PI*2); ctx.stroke();

  ctx.fillStyle   = col+'1e';
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 0, ps*0.38, 0, Math.PI*2); ctx.fill();

  ctx.shadowBlur     = 0;
  ctx.fillStyle      = col;
  ctx.font           = 'bold '+Math.max(8, Math.round(16*sc))+'px Orbitron,monospace';
  ctx.textAlign      = 'center';
  ctx.textBaseline   = 'middle';
  ctx.fillText(PU_ICON[p.type], 0, 1);
  ctx.restore();
}

// ── Particles ─────────────────────────────────────
function spawnPart(x, y, col, n) {
  for (var i=0; i<(n||14); i++) {
    var a = Math.random()*Math.PI*2, sp = Math.random()*5+1.5;
    S.particles.push({ x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      r:Math.random()*4+1.5, col:col, life:1, dec:Math.random()*0.022+0.025 });
  }
}

function tickPart() {
  for (var i=S.particles.length-1; i>=0; i--) {
    var p = S.particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.14;
    p.r*=0.965; p.life-=p.dec;
    if (p.life<=0) S.particles.splice(i,1);
  }
}

function drawPart() {
  for (var i=0; i<S.particles.length; i++) {
    var p = S.particles[i];
    ctx.save();
    ctx.globalAlpha  = Math.max(0, p.life);
    ctx.fillStyle    = p.col;
    ctx.shadowBlur   = 8; ctx.shadowColor = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Collision ─────────────────────────────────────
function zHit(az, bz, tol) { return Math.abs(az-bz) < tol; }

// ── HUD ───────────────────────────────────────────
function updateHUD() {
  document.getElementById('hitBar').style.width    = (S.hits/10*100)+'%';
  document.getElementById('hitCount').textContent  = S.hits+' / 10';
  document.getElementById('scoreVal').textContent  = String(Math.floor(S.score)).padStart(6,'0');
  document.getElementById('levelNum').textContent  = String(S.level).padStart(2,'0');
  var row = document.getElementById('livesRow');
  row.innerHTML = '';
  for (var i=0; i<3; i++) {
    var sp = document.createElement('span');
    sp.textContent = i < S.lives ? '❤' : '🖤';
    row.appendChild(sp);
  }
}

// ── Status banner ─────────────────────────────────
var banTid = null;
function showBanner(msg) {
  var el = document.getElementById('statusBanner');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(banTid);
  banTid = setTimeout(function(){ el.classList.remove('show'); }, 1200);
}

// ── Tick ──────────────────────────────────────────
function tick() {
  S.frame++;
  S.score += 0.14 + (S.level-1)*0.05 + S.combo*0.016;
  S.level  = 1 + Math.floor(S.hits / 3);

  if (S.shieldTimer  > 0) S.shieldTimer--;  else S.shieldOn = false;
  if (S.rapidTimer   > 0) S.rapidTimer--;   else S.rapidOn  = false;
  if (S.comboTimer   > 0) S.comboTimer--;   else S.combo    = 0;
  if (S.flashTimer   > 0) S.flashTimer--;
  if (S.pHitFlash    > 0) S.pHitFlash--;
  if (S.tHitFlash    > 0) S.tHitFlash--;

  // Auto-shoot
  if (S.pShootTimer > 0) S.pShootTimer--;
  if (S.playerLane === S.thiefLane && S.pShootTimer <= 0) {
    S.bullets.push({ lane:S.playerLane, z:PLAYER_Z+55, trail:[] });
    SFX.shoot();
    S.pShootTimer = S.rapidOn ? 14 : 26;
  }

  // Thief AI
  if (--S.tLaneTimer <= 0) {
    S.thiefLane  = Math.floor(Math.random()*3);
    S.tLaneTimer = Math.max(26, 78 - S.level*7);
  }

  // Bullets
  var bspeed = 24 + S.level*1.5;
  for (var i=S.bullets.length-1; i>=0; i--) {
    var b = S.bullets[i];
    b.trail.push({ z:b.z });
    if (b.trail.length > 7) b.trail.shift();
    b.z += bspeed;
    if (b.lane === S.thiefLane && zHit(b.z, THIEF_Z, 130)) {
      S.hits++; S.combo++; S.comboTimer = 110;
      var bonus = S.combo > 1 ? S.combo*7 : 0;
      S.score += 10 + bonus;
      S.tHitFlash = 16;
      var tp = project(THIEF_Z);
      var tx = laneX(S.thiefLane, THIEF_Z);
      spawnPart(tx, tp.screenY-55, '#ff0055', 20);
      S.flashTimer = 7; S.flashColor = 'rgba(255,0,80,0.12)';
      SFX.hit();
      if (S.combo > 1) showBanner('COMBO \u00d7'+S.combo+'  +'+bonus+'pts');
      S.bullets.splice(i,1);
      updateHUD();
      if (S.hits >= 10) { endGame(true); return; }
      continue;
    }
    if (b.z > THIEF_Z + 200) S.bullets.splice(i,1);
  }

  // Obstacles
  var obsRate = Math.max(46, 95 - S.level*9);
  if (S.frame % obsRate === 0) {
    S.obstacles.push({ lane:Math.floor(Math.random()*3), z:THIEF_Z*1.18, spin:0 });
  }
  var ospeed = 9 + S.level*0.85;
  for (var oi=S.obstacles.length-1; oi>=0; oi--) {
    var o = S.obstacles[oi];
    o.z -= ospeed; o.spin += 0.036;
    if (o.z < 25) { S.obstacles.splice(oi,1); continue; }
    if (o.lane === S.playerLane && zHit(o.z, PLAYER_Z, 88)) {
      var pp = project(PLAYER_Z);
      var px = laneX(S.playerLane, PLAYER_Z);
      if (S.shieldOn) {
        S.shieldOn=false; S.shieldTimer=0;
        spawnPart(px, pp.screenY-80, '#00ff9d', 18);
        S.obstacles.splice(oi,1);
        SFX.power(); showBanner('SHIELD BLOCKED!');
      } else {
        S.lives--;
        S.pHitFlash=22;
        S.flashTimer=20; S.flashColor='rgba(255,0,0,0.22)';
        spawnPart(px, pp.screenY-80, '#ff3333', 26);
        SFX.crash();
        S.obstacles.splice(oi,1);
        updateHUD();
        if (S.lives<=0) { endGame(false); return; }
      }
    }
  }

  // Power-ups
  if (S.frame % 215 === 0) {
    var types=['shield','rapid','life'];
    S.powerups.push({ lane:Math.floor(Math.random()*3), z:THIEF_Z*1.2,
      type:types[Math.floor(Math.random()*3)], spin:0 });
  }
  for (var pi=S.powerups.length-1; pi>=0; pi--) {
    var pup = S.powerups[pi];
    pup.z -= 5; pup.spin += 0.06;
    if (pup.z < 25) { S.powerups.splice(pi,1); continue; }
    if (pup.lane === S.playerLane && zHit(pup.z, PLAYER_Z, 92)) {
      SFX.power();
      var pp2 = project(PLAYER_Z);
      var px2 = laneX(S.playerLane, PLAYER_Z);
      spawnPart(px2, pp2.screenY-80, PU_COL[pup.type], 16);
      if (pup.type==='shield'){ S.shieldOn=true;  S.shieldTimer=330; showBanner('\u26a1 SHIELD ONLINE'); }
      if (pup.type==='rapid') { S.rapidOn =true;  S.rapidTimer =270; showBanner('\ud83d\udd25 RAPID FIRE'); }
      if (pup.type==='life' && S.lives<3){ S.lives++; updateHUD(); showBanner('\u2764 EXTRA LIFE'); }
      S.powerups.splice(pi,1);
    }
  }

  tickPart();
}

// ── Render ────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawRoad();

  if (S.flashTimer > 0) {
    ctx.fillStyle = S.flashColor;
    ctx.fillRect(0, 0, W, H);
  }

  // Sort far-to-near
  var objs = [];
  for (var i=0; i<S.obstacles.length; i++) objs.push({ z:S.obstacles[i].z, d:S.obstacles[i], t:'o' });
  for (var i=0; i<S.powerups.length;  i++) objs.push({ z:S.powerups[i].z,  d:S.powerups[i],  t:'p' });
  objs.sort(function(a,b){ return b.z-a.z; });
  for (var i=0; i<objs.length; i++) {
    if (objs[i].t==='o') drawObstacle(objs[i].d);
    else                  drawPowerup(objs[i].d);
  }

  drawSprite(S.thiefLane, THIEF_Z, false, S.tHitFlash);
  drawBullets();
  drawPart();
  drawSprite(S.playerLane, PLAYER_Z, true,  S.pHitFlash);

  // Combo text
  if (S.combo > 1 && S.comboTimer > 0) {
    var a = Math.min(1, S.comboTimer/40);
    ctx.save();
    ctx.globalAlpha  = a;
    ctx.fillStyle    = '#ffe600';
    ctx.shadowBlur   = 18; ctx.shadowColor = '#ffe600';
    var fs = Math.max(16, Math.min(28, Math.round(W*0.036)));
    ctx.font         = '900 '+fs+'px Orbitron,monospace';
    ctx.textAlign    = 'center';
    ctx.fillText('\u00d7'+S.combo+' COMBO', W*0.5, H*0.49);
    ctx.restore();
  }

  // Active power-up labels
  var labelY = H * CFG.HORIZON + 24;
  if (S.rapidOn)  {
    ctx.save(); ctx.fillStyle='#ffe600'; ctx.shadowBlur=8; ctx.shadowColor='#ffe600';
    ctx.font='bold 12px Orbitron,monospace'; ctx.textAlign='right';
    ctx.fillText('RAPID FIRE', W-16, labelY); ctx.restore();
  }
  if (S.shieldOn) {
    ctx.save(); ctx.fillStyle='#00ff9d'; ctx.shadowBlur=8; ctx.shadowColor='#00ff9d';
    ctx.font='bold 12px Orbitron,monospace'; ctx.textAlign='left';
    ctx.fillText('SHIELD', 16, labelY); ctx.restore();
  }
}

// ── Loop ──────────────────────────────────────────
function loop() {
  if (!S.running) return;
  tick();
  render();
  S.raf = requestAnimationFrame(loop);
}

// ── End ───────────────────────────────────────────
function endGame(win) {
  S.running = false;
  cancelAnimationFrame(S.raf);
  document.getElementById('gameScreen').classList.remove('active');
  var go = document.getElementById('gameoverScreen');
  go.classList.add('active');
  var badge = document.getElementById('goBadge');
  var title = document.getElementById('goTitle');
  if (win) {
    badge.textContent='MISSION COMPLETE'; badge.style.color='#00f2ff'; badge.style.borderColor='#00f2ff';
    title.textContent='THIEF CAUGHT'; title.style.textShadow='0 0 30px #00f2ff';
    document.getElementById('goMsg').textContent='Outstanding work, officer.';
  } else {
    badge.textContent='MISSION FAILED'; badge.style.color='#ff0055'; badge.style.borderColor='#ff0055';
    title.textContent='ELIMINATED'; title.style.textShadow='0 0 30px #ff0055';
    document.getElementById('goMsg').textContent='You ran out of lives.';
  }
  document.getElementById('goStats').innerHTML =
    'SCORE &nbsp; '+String(Math.floor(S.score)).padStart(6,'0')+'<br>'+
    'LEVEL &nbsp; '+S.level+' &nbsp;\u00b7&nbsp; HITS &nbsp; '+S.hits+' / 10'+(S.combo>1?'<br>BEST COMBO &nbsp; \u00d7'+S.combo:'');
}

// ── Controls ──────────────────────────────────────
function goLeft()  { if (S.running && S.playerLane > 0)  S.playerLane--; }
function goRight() { if (S.running && S.playerLane < 2)  S.playerLane++; }

window.addEventListener('keydown', function(e) {
  if (e.key==='ArrowLeft')  { e.preventDefault(); goLeft();  }
  if (e.key==='ArrowRight') { e.preventDefault(); goRight(); }
});

function bindBtn(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', function(e){ e.preventDefault(); fn(); }, {passive:false});
  el.addEventListener('mousedown', fn);
}
bindBtn('mLeft',  goLeft);
bindBtn('mRight', goRight);

// ── Start ─────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', function() {
  try { getAC().resume(); } catch(e){}

  S.running=false; S.frame=0; S.score=0; S.hits=0; S.lives=3; S.level=1;
  S.playerLane=1; S.pShootTimer=0; S.pHitFlash=0;
  S.shieldOn=false; S.shieldTimer=0;
  S.rapidOn=false;  S.rapidTimer=0;
  S.thiefLane=1; S.tHitFlash=0; S.tLaneTimer=70;
  S.bullets=[]; S.obstacles=[]; S.powerups=[]; S.particles=[];
  S.combo=0; S.comboTimer=0; S.flashTimer=0;
  roadScroll=0;

  updateHUD();
  document.getElementById('startScreen').classList.remove('active');
  document.getElementById('gameScreen').classList.add('active');
  S.running=true;
  loop();
});
