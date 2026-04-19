/* ============================================================
   NEON CHASE v6.0  —  game.js
   Full pseudo-3D · Visible bullets · Satisfying gameplay
   Infinite runner · No bugs · Mobile-first
   ============================================================ */
(function () {
'use strict';

/* ── Canvas ──────────────────────────────────────────── */
var C   = document.getElementById('gc');
var ctx = C.getContext('2d');
var W, H, HY;   // width, height, horizon Y

function resize() {
  W  = C.width  = window.innerWidth;
  H  = C.height = window.innerHeight;
  HY = H * 0.40;          // horizon at 40% down
}
resize();
window.addEventListener('resize', resize);

/* ── Images ──────────────────────────────────────────── */
var IMG = {};
function loadImg(key, src) {
  var i = new Image();
  i.src = src;
  IMG[key] = i;
}
loadImg('gun',   'gun.png');
loadImg('thief', 'thief.png');

/* ── Sound ───────────────────────────────────────────── */
var AC;
function getAC() { return AC || (AC = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(hz, type, dur, vol) {
  try {
    var a = getAC(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type = type; o.frequency.value = hz;
    o.frequency.exponentialRampToValueAtTime(hz * 0.4, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.start(); o.stop(a.currentTime + dur);
  } catch(e){}
}
var SFX = {
  shoot: function(){ tone(900,'square',0.06,0.12); },
  hit:   function(){ tone(180,'sawtooth',0.12,0.25); setTimeout(function(){tone(440,'sine',0.1,0.12);},40); },
  crash: function(){ tone(55,'sawtooth',0.5,0.3); },
  pu:    function(){ tone(440,'sine',0.05,0.15); setTimeout(function(){tone(660,'sine',0.05,0.15);},70); setTimeout(function(){tone(880,'sine',0.1,0.15);},140); },
  combo: function(){ tone(1100,'sine',0.08,0.15); }
};

/* ── 3D Road projection ──────────────────────────────── */
/*
  Road is a trapezoid:
    Horizon y = HY
    At bottom (y=H): road spans ROAD_BOT * W, centered
    At depth t (0=horizon, 1=bottom): scale linearly

  roadPoint(lane, t) → {x, y, scale}
    lane ∈ {0,1,2}
    t    ∈ [0, 1]
*/
var ROAD_BOT = 0.84;   // road width fraction at bottom
var LANES    = 3;

function rp(lane, t) {
  var y     = HY + t * (H - HY);
  var half  = W * ROAD_BOT * 0.5 * t;
  var lw    = half * 2 / LANES;
  var x     = W * 0.5 - half + lw * (lane + 0.5);
  return { x: x, y: y, sc: t };
}

function edgeX(side, t) {           // side -1 or 1
  return W * 0.5 + side * W * ROAD_BOT * 0.5 * t;
}

/* fixed depths for sprites */
var PT = 0.88;   // player depth (big, near bottom)
var TT = 0.16;   // thief  depth (smaller, near horizon)

/* ── Particles ───────────────────────────────────────── */
var parts = [];
function spawnParts(x, y, col, n) {
  for (var i = 0; i < (n || 14); i++) {
    var a = Math.random() * Math.PI * 2;
    var s = Math.random() * 5 + 1.5;
    parts.push({ x:x, y:y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
      r:Math.random()*4+1.5, col:col, life:1, dec:Math.random()*0.02+0.025 });
  }
}
function tickParts() {
  for (var i = parts.length-1; i >= 0; i--) {
    var p = parts[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.14;
    p.r *= 0.968; p.life -= p.dec;
    if (p.life <= 0) parts.splice(i, 1);
  }
}
function drawParts() {
  ctx.save();
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.col;
    ctx.shadowBlur  = 8; ctx.shadowColor = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

/* ── Stars ───────────────────────────────────────────── */
var stars = [];
for (var si = 0; si < 140; si++) {
  stars.push({
    x: Math.random(), y: Math.random() * 0.38,
    r: Math.random() * 1.5 + 0.2,
    b: Math.random() * 0.55 + 0.25,
    s: Math.random() * 0.00018 + 0.00004
  });
}

/* ── Road scroll ─────────────────────────────────────── */
var roadScroll = 0;

/* ── Game state ──────────────────────────────────────── */
var G = {};

function resetState() {
  G = {
    running: false,
    frame:   0,
    score:   0,
    dist:    0,
    level:   1,
    lives:   3,

    /* player */
    lane:         1,
    shootTimer:   0,
    pFlash:       0,
    shieldOn:     false,
    shieldTimer:  0,
    rapidOn:      false,
    rapidTimer:   0,

    /* thief */
    tLane:    1,
    tFlash:   0,
    tTimer:   70,

    /* objects */
    bullets:   [],
    obstacles: [],
    powerups:  [],

    /* feedback */
    combo:      0,
    comboTimer: 0,
    flashTimer: 0,
    flashCol:   'rgba(255,0,0,0.18)',

    raf: null
  };
  parts = [];
  roadScroll = 0;
}

/* ── Sky ─────────────────────────────────────────────── */
function drawSky() {
  var sg = ctx.createLinearGradient(0, 0, 0, HY);
  sg.addColorStop(0,    '#01020c');
  sg.addColorStop(0.6,  '#05061a');
  sg.addColorStop(1,    '#0d0828');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, W, HY);

  /* purple city-glow at horizon */
  var cg = ctx.createRadialGradient(W/2, HY, 0, W/2, HY, W*0.55);
  cg.addColorStop(0,    'rgba(80,0,180,0.45)');
  cg.addColorStop(0.5,  'rgba(30,0,80,0.2)');
  cg.addColorStop(1,    'transparent');
  ctx.fillStyle = cg;
  ctx.fillRect(0, HY*0.2, W, HY*0.85);

  /* stars */
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.x = (s.x + s.s) % 1;
    var tw = 0.6 + 0.4 * Math.sin(G.frame * 0.014 + s.x * 11);
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,' + (s.b * tw).toFixed(2) + ')';
    ctx.fill();
  }
}

/* ── Road ────────────────────────────────────────────── */
function drawRoad() {
  /* road surface trapezoid */
  var nL = edgeX(-1, 1), nR = edgeX(1, 1);
  var fL = edgeX(-1, 0.001), fR = edgeX(1, 0.001);

  ctx.beginPath();
  ctx.moveTo(fL, HY); ctx.lineTo(fR, HY);
  ctx.lineTo(nR, H);  ctx.lineTo(nL, H);
  ctx.closePath();
  var rg = ctx.createLinearGradient(0, HY, 0, H);
  rg.addColorStop(0,   '#0a0720');
  rg.addColorStop(0.4, '#120c2e');
  rg.addColorStop(1,   '#1d1245');
  ctx.fillStyle = rg; ctx.fill();

  /* scrolling horizontal grid stripes */
  var ROWS = 26;
  var spd  = 0.38 + (G.level - 1) * 0.10;
  roadScroll = (roadScroll + spd) % (H / ROWS);

  for (var r = 0; r <= ROWS + 1; r++) {
    var yf = ((r / ROWS) + roadScroll / H) % 1.0;
    var sy = HY + yf * (H - HY);
    if (sy < HY || sy > H + 1) continue;
    var t2 = (sy - HY) / (H - HY);
    if (t2 < 0.001) continue;
    var lx = edgeX(-1, t2), rx = edgeX(1, t2);
    ctx.beginPath(); ctx.moveTo(lx, sy); ctx.lineTo(rx, sy);
    if (r % 2 === 0) {
      ctx.strokeStyle = 'rgba(0,220,255,0.13)'; ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = 'rgba(140,0,255,0.08)'; ctx.lineWidth = 0.5;
    }
    ctx.stroke();
  }

  /* lane divider lines */
  for (var l = 1; l < LANES; l++) {
    var f = l / LANES;
    var nx = nL + (nR - nL) * f;
    var fx = fL + (fR - fL) * f;
    ctx.beginPath();
    ctx.moveTo(fx, HY); ctx.lineTo(nx, H);
    var ld = ctx.createLinearGradient(0, HY, 0, H);
    ld.addColorStop(0,   'rgba(0,242,255,0.00)');
    ld.addColorStop(0.4, 'rgba(0,242,255,0.20)');
    ld.addColorStop(1,   'rgba(0,242,255,0.48)');
    ctx.strokeStyle = ld; ctx.lineWidth = 1.8; ctx.stroke();
  }

  /* neon edge glow lines */
  ctx.save();
  ctx.shadowBlur = 20; ctx.shadowColor = '#00f2ff';
  ctx.strokeStyle = '#00f2ff'; ctx.lineWidth = 2.8; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(fL, HY); ctx.lineTo(nL, H); ctx.stroke();
  ctx.shadowColor = '#ff00ea'; ctx.strokeStyle = '#ff00ea';
  ctx.beginPath(); ctx.moveTo(fR, HY); ctx.lineTo(nR, H); ctx.stroke();
  ctx.restore();

  /* dark road shoulders */
  ctx.fillStyle = '#050318';
  ctx.fillRect(0, HY, nL, H - HY);
  ctx.fillRect(nR, HY, W - nR, H - HY);

  /* horizon glow line */
  ctx.save();
  var hl = ctx.createLinearGradient(0, 0, W, 0);
  hl.addColorStop(0,    'transparent');
  hl.addColorStop(0.22, '#00f2ff');
  hl.addColorStop(0.78, '#ff00ea');
  hl.addColorStop(1,    'transparent');
  ctx.strokeStyle = hl; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.65;
  ctx.beginPath(); ctx.moveTo(0, HY); ctx.lineTo(W, HY); ctx.stroke();
  ctx.restore();
}

/* ── roundRect ───────────────────────────────────────── */
function rrect(x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);      ctx.arcTo(x+w,y,   x+w,y+r,   r);
  ctx.lineTo(x+w,   y+h-r);  ctx.arcTo(x+w,y+h, x+w-r,y+h, r);
  ctx.lineTo(x+r,   y+h);    ctx.arcTo(x,y+h,   x,y+h-r,   r);
  ctx.lineTo(x,     y+r);    ctx.arcTo(x,y,     x+r,y,     r);
  ctx.closePath();
}

/* ── Sprite drawing ──────────────────────────────────── */
function drawSprite(lane, t, isPlayer, flash) {
  var p  = rp(lane, t);
  var sc = p.sc;

  /* size: player small at bottom, thief bigger relative to its depth */
  var bw, bh;
  if (isPlayer) {
    bw = Math.min(W * 0.14, 105) * (sc / PT);
    bh = bw * 1.5;
  } else {
    bw = Math.min(W * 0.18, 140) * (sc / TT);
    bh = bw * 1.4;
  }

  var dx = p.x - bw / 2;
  var dy = p.y - bh;

  ctx.save();

  /* ground shadow ellipse */
  ctx.save();
  ctx.globalAlpha = 0.20 * Math.min(sc * 1.5, 1);
  ctx.fillStyle   = isPlayer ? (G.shieldOn ? '#00ff9d' : '#00ccff') : '#ff0044';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + bh*0.015, bw*0.44, bh*0.05, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  if (flash > 0) ctx.globalAlpha = 0.35 + 0.65*(Math.sin(G.frame*1.7)*0.5+0.5);

  var img = isPlayer ? IMG.gun : IMG.thief;
  if (img && img.complete && img.naturalWidth > 0) {
    if (isPlayer && G.shieldOn) { ctx.shadowBlur = 30*sc; ctx.shadowColor = '#00ff9d'; }
    ctx.drawImage(img, dx, dy, bw, bh);
    ctx.shadowBlur = 0;
  } else {
    drawCar(p.x, p.y, bw, bh, isPlayer, sc);
  }

  ctx.globalAlpha = 1;

  /* shield bubble */
  if (isPlayer && G.shieldOn) {
    ctx.save();
    var pulse = 0.5 + 0.5*Math.sin(G.frame*0.16);
    ctx.globalAlpha = pulse * 0.62;
    ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 2.5*sc;
    ctx.shadowBlur = 22*sc; ctx.shadowColor = '#00ff9d';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - bh*0.42, bw*0.6, bh*0.56, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  /* thief direction arrow */
  if (!isPlayer) {
    var az = Math.max(7*sc, 5);
    ctx.save();
    ctx.fillStyle = '#ff0044'; ctx.shadowBlur = 10*sc; ctx.shadowColor = '#ff0044';
    ctx.globalAlpha = 0.65 + 0.35*Math.abs(Math.sin(G.frame*0.12));
    ctx.beginPath();
    ctx.moveTo(p.x,      p.y + az*0.3);
    ctx.lineTo(p.x - az, p.y + az*2);
    ctx.lineTo(p.x + az, p.y + az*2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/* procedural car fallbacks */
function drawCar(cx, by, w, h, isPlayer, sc) {
  ctx.save();
  if (isPlayer) {
    ctx.fillStyle = G.shieldOn ? '#00ff9d' : '#00e5ff';
    ctx.shadowBlur = 22*sc; ctx.shadowColor = ctx.fillStyle;
    rrect(cx-w*.37, by-h*.78, w*.74, h*.65, 8*sc); ctx.fill();
    ctx.fillStyle = 'rgba(0,20,60,.9)'; ctx.shadowBlur = 0;
    rrect(cx-w*.23, by-h*.78, w*.46, h*.28, 5*sc); ctx.fill();
    ctx.strokeStyle = 'rgba(0,242,255,.4)'; ctx.lineWidth = 1*sc; ctx.stroke();
    ctx.fillStyle = '#ffffffcc'; ctx.shadowBlur = 9*sc; ctx.shadowColor = '#fff';
    ctx.fillRect(cx-3*sc, by-h, 6*sc, h*.25);
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 10*sc;
    ctx.beginPath(); ctx.arc(cx-w*.32, by-h*.64, 4.5*sc, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+w*.32, by-h*.64, 4.5*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(0,225,255,.22)'; ctx.shadowBlur = 18*sc; ctx.shadowColor = '#00e5ff';
    ctx.beginPath(); ctx.ellipse(cx, by-h*.055, w*.45, h*.062, 0, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle = '#e80040'; ctx.shadowBlur = 24*sc; ctx.shadowColor = '#ff0044';
    rrect(cx-w*.40, by-h*.80, w*.80, h*.68, 8*sc); ctx.fill();
    ctx.fillStyle = 'rgba(42,0,20,.92)'; ctx.shadowBlur = 0;
    rrect(cx-w*.25, by-h*.80, w*.50, h*.30, 5*sc); ctx.fill();
    ctx.strokeStyle = 'rgba(255,0,60,.4)'; ctx.lineWidth = 1*sc; ctx.stroke();
    ctx.fillStyle = '#ff6500'; ctx.shadowBlur = 12*sc; ctx.shadowColor = '#ff6500';
    ctx.beginPath(); ctx.arc(cx-w*.13, by-h*.84, 5.5*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff0028'; ctx.shadowColor = '#ff0028';
    ctx.beginPath(); ctx.arc(cx+w*.13, by-h*.84, 5.5*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,0,50,.22)'; ctx.shadowBlur = 18*sc; ctx.shadowColor = '#ff0044';
    ctx.beginPath(); ctx.ellipse(cx, by-h*.055, w*.45, h*.062, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/* ── Bullets ─────────────────────────────────────────── */
/*
  Each bullet travels from player depth toward thief depth.
  t increases from PT toward TT (moves "forward" into screen).
  We draw it at its current depth, properly scaled.
*/
function drawBullets() {
  ctx.save();
  for (var i = 0; i < G.bullets.length; i++) {
    var b  = G.bullets[i];
    var p  = rp(b.lane, b.t);
    var sc = p.sc;
    var bw = 9 * sc, bh = 22 * sc;

    /* glowing trail */
    for (var ti = 0; ti < b.trail.length; ti++) {
      var tr = b.trail[ti];
      var tp = rp(b.lane, tr);
      var ts = tp.sc;
      ctx.globalAlpha = (ti / b.trail.length) * 0.38;
      ctx.fillStyle   = '#00f2ff';
      ctx.fillRect(tp.x - bw*0.35, tp.y - bh*0.35, bw*0.7, bh*0.7);
    }
    ctx.globalAlpha = 1;

    /* bullet body */
    ctx.shadowBlur = 18*sc; ctx.shadowColor = '#00f2ff';
    ctx.fillStyle  = '#ffffff';
    ctx.fillRect(p.x - bw/2, p.y - bh, bw, bh);

    /* bright tip */
    ctx.fillStyle = '#00f2ff';
    ctx.beginPath(); ctx.arc(p.x, p.y - bh, bw/2, 0, Math.PI*2); ctx.fill();

    /* muzzle flash on first few frames */
    if (b.age < 4) {
      var msc = (4 - b.age) / 4;
      ctx.globalAlpha = msc;
      ctx.fillStyle   = '#ffe600';
      ctx.shadowBlur  = 24*sc; ctx.shadowColor = '#ffe600';
      ctx.beginPath(); ctx.arc(p.x, p.y - bh, 10*sc*msc, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ── Obstacle ─────────────────────────────────────────── */
function drawObs(o) {
  var p  = rp(o.lane, o.t);
  var sc = p.sc;
  var ow = 62*sc, oh = 54*sc;

  ctx.save();
  ctx.translate(p.x, p.y - oh*0.5);
  ctx.rotate(o.spin);

  ctx.fillStyle = '#b500cc'; ctx.shadowBlur = 24*sc; ctx.shadowColor = '#ff00ea';
  rrect(-ow/2, -oh/2, ow, oh, 7*sc); ctx.fill();
  ctx.fillStyle = '#ff44ff'; ctx.shadowBlur = 0;
  rrect(-ow*0.28, -oh*0.28, ow*0.56, oh*0.56, 4*sc); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + Math.max(10, Math.round(22*sc)) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, 1);
  ctx.restore();

  /* shadow on road */
  ctx.save();
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#ff00ea';
  ctx.beginPath(); ctx.ellipse(p.x, p.y+4*sc, ow*0.42, 7*sc, 0, 0, Math.PI*2);
  ctx.fill(); ctx.restore();
}

/* ── Power-up ─────────────────────────────────────────── */
var PU_COL  = { shield:'#00ff9d', rapid:'#ffe600', life:'#ff4466' };
var PU_ICON = { shield:'S', rapid:'R', life:'♥' };

function drawPU(pu) {
  var p   = rp(pu.lane, pu.t);
  var sc  = p.sc;
  var ps  = 50*sc;
  var col = PU_COL[pu.type];
  var pulse = 0.65 + 0.35*Math.abs(Math.sin(G.frame*0.1));

  ctx.save();
  ctx.translate(p.x, p.y - ps*0.5);
  ctx.rotate(pu.spin);
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = col; ctx.lineWidth = 2.5*sc;
  ctx.shadowBlur = 22*sc; ctx.shadowColor = col;
  ctx.beginPath(); ctx.arc(0, 0, ps*0.5, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = col+'1c'; ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 0, ps*0.38, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = col;
  ctx.font = 'bold ' + Math.max(8, Math.round(16*sc)) + 'px Orbitron,monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PU_ICON[pu.type], 0, 1);
  ctx.restore();
}

/* ── HUD ──────────────────────────────────────────────── */
function updHUD() {
  document.getElementById('hScore').textContent = Math.floor(G.score);
  document.getElementById('hLevel').textContent = G.level;
  var lv = '';
  for (var i = 0; i < 3; i++) lv += (i < G.lives ? '❤' : '🖤');
  document.getElementById('hLives').textContent = lv;

  var sb = document.getElementById('shieldBar');
  var rb = document.getElementById('rapidBar');
  if (G.shieldOn) {
    sb.classList.remove('hidden');
    document.getElementById('shieldFill').style.width = (G.shieldTimer/330*100)+'%';
  } else sb.classList.add('hidden');
  if (G.rapidOn) {
    rb.classList.remove('hidden');
    document.getElementById('rapidFill').style.width = (G.rapidTimer/270*100)+'%';
  } else rb.classList.add('hidden');
}

/* ── Event text ───────────────────────────────────────── */
var evtTid = null;
function showEvt(msg) {
  var el = document.getElementById('evtText');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(evtTid);
  evtTid = setTimeout(function(){ el.classList.remove('show'); }, 1200);
}

/* ── Depth-hit test ──────────────────────────────────── */
function dHit(at, bt, tol) { return Math.abs(at - bt) < tol; }

/* screen pos for particle burst */
function sPos(lane, t) {
  var p = rp(lane, t);
  return { x: p.x, y: p.y - 55*p.sc };
}

/* ── Tick ────────────────────────────────────────────── */
function tick() {
  G.frame++;
  G.dist++;
  G.score += 0.16 + (G.level-1)*0.04;
  G.level  = 1 + Math.floor(G.dist / 600);

  /* timers */
  if (G.shieldTimer > 0) G.shieldTimer--; else G.shieldOn = false;
  if (G.rapidTimer  > 0) G.rapidTimer--;  else G.rapidOn  = false;
  if (G.comboTimer  > 0) G.comboTimer--;  else G.combo     = 0;
  if (G.flashTimer  > 0) G.flashTimer--;
  if (G.pFlash      > 0) G.pFlash--;
  if (G.tFlash      > 0) G.tFlash--;

  /* auto-shoot when aligned with thief lane */
  if (G.shootTimer > 0) G.shootTimer--;
  if (G.lane === G.tLane && G.shootTimer <= 0) {
    G.bullets.push({ lane:G.lane, t:PT - 0.04, trail:[], age:0 });
    SFX.shoot();
    G.shootTimer = G.rapidOn ? 14 : 28;
  }

  /* thief AI: change lane randomly */
  if (--G.tTimer <= 0) {
    G.tLane  = Math.floor(Math.random()*LANES);
    G.tTimer = Math.max(22, 78 - G.level*7);
  }

  /* ── bullets: t DECREASES (player=0.88 → thief=0.16, toward horizon) ── */
  var bSpd = 0.028 + G.level*0.002;
  for (var i = G.bullets.length-1; i >= 0; i--) {
    var b = G.bullets[i];
    b.trail.push(b.t);
    if (b.trail.length > 8) b.trail.shift();
    b.t  -= bSpd;   /* DECREASING: moves from PT(0.88) toward TT(0.16) */
    b.age++;

    /* hit thief? */
    if (b.lane === G.tLane && dHit(b.t, TT, 0.10)) {
      G.combo++; G.comboTimer = 100;
      var pts = 10 + (G.combo>1 ? G.combo*7 : 0);
      G.score += pts;
      G.tFlash = 16;
      var sp = sPos(G.tLane, TT);
      spawnParts(sp.x, sp.y, '#ff0044', 22);
      G.flashTimer = 7; G.flashCol = 'rgba(255,0,80,0.12)';
      SFX.hit();
      if (G.combo > 1) { SFX.combo(); showEvt('COMBO \u00d7'+G.combo+'  +'+pts); }
      else showEvt('+'+pts);
      G.bullets.splice(i, 1);
      updHUD(); continue;
    }
    /* gone past thief toward horizon */
    if (b.t < TT - 0.14) G.bullets.splice(i, 1);
  }

  /* ── obstacles ── */
  var obsRate = Math.max(42, 92 - G.level*8);
  if (G.frame % obsRate === 0) {
    var ol; do { ol = Math.floor(Math.random()*LANES); } while (Math.random()<0.3 && ol===G.lane);
    G.obstacles.push({ lane:ol, t:0.02, spin:0 });
  }

  var oSpd = 0.008 + G.level*0.0008;
  for (var oi = G.obstacles.length-1; oi >= 0; oi--) {
    var o = G.obstacles[oi];
    o.t += oSpd; o.spin += 0.035;
    if (o.t > 1.06) { G.obstacles.splice(oi,1); continue; }
    if (o.lane === G.lane && dHit(o.t, PT, 0.07)) {
      var sp2 = sPos(G.lane, PT);
      if (G.shieldOn) {
        G.shieldOn = false; G.shieldTimer = 0;
        spawnParts(sp2.x, sp2.y, '#00ff9d', 20);
        SFX.pu(); showEvt('SHIELD SAVED YOU!');
      } else {
        G.lives--; G.pFlash = 24;
        G.flashTimer = 22; G.flashCol = 'rgba(255,0,0,0.24)';
        spawnParts(sp2.x, sp2.y, '#ff3333', 28);
        SFX.crash();
        if (G.lives <= 0) { endGame(); return; }
        showEvt('OUCH! \u2665 '+G.lives+' left');
      }
      G.obstacles.splice(oi,1); updHUD();
    }
  }

  /* ── powerups ── */
  if (G.frame % 220 === 0) {
    var types=['shield','rapid','life'];
    G.powerups.push({ lane:Math.floor(Math.random()*LANES), t:0.02,
      type:types[Math.floor(Math.random()*3)], spin:0 });
  }
  var puSpd = 0.005;
  for (var pi = G.powerups.length-1; pi >= 0; pi--) {
    var pu = G.powerups[pi];
    pu.t += puSpd; pu.spin += 0.07;
    if (pu.t > 1.06) { G.powerups.splice(pi,1); continue; }
    if (pu.lane === G.lane && dHit(pu.t, PT, 0.09)) {
      SFX.pu();
      var sp3 = sPos(G.lane, PT);
      spawnParts(sp3.x, sp3.y, PU_COL[pu.type], 18);
      if (pu.type==='shield'){ G.shieldOn=true;  G.shieldTimer=330; showEvt('\u26a1 SHIELD ONLINE!'); }
      if (pu.type==='rapid') { G.rapidOn =true;  G.rapidTimer =270; showEvt('\ud83d\udd25 RAPID FIRE!'); }
      if (pu.type==='life' && G.lives<3){ G.lives++; updHUD(); showEvt('\u2764 EXTRA LIFE!'); }
      G.powerups.splice(pi,1); updHUD();
    }
  }

  tickParts();
}

/* ── Render ──────────────────────────────────────────── */
function render() {
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawRoad();

  /* screen flash */
  if (G.flashTimer > 0) {
    ctx.fillStyle = G.flashCol;
    ctx.fillRect(0, 0, W, H);
  }

  /* sort obstacles + powerups far→near (small t first) */
  var objs = [];
  for (var i = 0; i < G.obstacles.length; i++) objs.push({t:G.obstacles[i].t, d:G.obstacles[i], tp:'o'});
  for (var i = 0; i < G.powerups.length;  i++) objs.push({t:G.powerups[i].t,  d:G.powerups[i],  tp:'p'});
  objs.sort(function(a,b){ return a.t-b.t; });
  for (var i = 0; i < objs.length; i++) {
    if (objs[i].tp==='o') drawObs(objs[i].d);
    else                   drawPU(objs[i].d);
  }

  /* thief behind bullets */
  drawSprite(G.tLane, TT, false, G.tFlash);
  drawBullets();
  drawParts();
  /* player always on top */
  drawSprite(G.lane, PT, true, G.pFlash);

  /* ── canvas-space combo text ── */
  if (G.combo > 1 && G.comboTimer > 0) {
    var a  = Math.min(1, G.comboTimer/40);
    var fs = Math.max(18, Math.min(28, Math.round(W*0.044)));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle   = '#ffe600'; ctx.shadowBlur = 20; ctx.shadowColor = '#ffe600';
    ctx.font        = '900 '+fs+'px Orbitron,monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('\u00d7'+G.combo+' COMBO', W*0.5, H*0.47);
    ctx.restore();
  }

  /* power-up labels near horizon */
  var labelY = HY + 22;
  if (G.rapidOn)  drawLabel('RAPID',  'right', W-16, labelY, '#ffe600');
  if (G.shieldOn) drawLabel('SHIELD', 'left',  16,   labelY, '#00ff9d');

  /* score ticker (subtle, on canvas) */
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.font      = '900 ' + Math.max(80, Math.round(H*0.14)) + 'px Orbitron,monospace';
  ctx.textAlign = 'center'; ctx.globalAlpha = 0.04;
  ctx.fillText(Math.floor(G.score), W*0.5, H*0.75);
  ctx.restore();
}

function drawLabel(text, align, x, y, col) {
  ctx.save();
  ctx.fillStyle  = col; ctx.shadowBlur = 8; ctx.shadowColor = col;
  ctx.font       = 'bold 11px Orbitron,monospace';
  ctx.textAlign  = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ── Loop ────────────────────────────────────────────── */
function loop() {
  if (!G.running) return;
  tick(); render();
  G.raf = requestAnimationFrame(loop);
}

/* ── End game ────────────────────────────────────────── */
function endGame() {
  G.running = false;
  cancelAnimationFrame(G.raf);
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('bars').classList.add('hidden');
  document.getElementById('ctrl').classList.add('hidden');

  document.getElementById('goTag').textContent   = 'MISSION FAILED';
  document.getElementById('goTitle').textContent = 'ELIMINATED';
  document.getElementById('goInfo').innerHTML    =
    'SCORE &nbsp;&nbsp; '  + Math.floor(G.score) + '<br>' +
    'LEVEL &nbsp;&nbsp; '  + G.level             + '<br>' +
    'DISTANCE &nbsp; '     + G.dist + 'm';
  document.getElementById('goScreen').classList.remove('hidden');
}

/* ── Controls ────────────────────────────────────────── */
function mvL() { if (G.running && G.lane > 0)        G.lane--; }
function mvR() { if (G.running && G.lane < LANES-1)  G.lane++; }

window.addEventListener('keydown', function(e){
  if (e.key==='ArrowLeft' ){ e.preventDefault(); mvL(); }
  if (e.key==='ArrowRight'){ e.preventDefault(); mvR(); }
});

function bindBtn(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', function(e){ e.preventDefault(); fn(); },{passive:false});
  el.addEventListener('mousedown', fn);
}
bindBtn('cLeft',  mvL);
bindBtn('cRight', mvR);

/* swipe */
var swX = null;
window.addEventListener('touchstart', function(e){ swX = e.touches[0].clientX; },{passive:true});
window.addEventListener('touchend',   function(e){
  if (swX===null) return;
  var dx = e.changedTouches[0].clientX - swX;
  if (Math.abs(dx) > 35) { dx < 0 ? mvL() : mvR(); }
  swX = null;
});

/* ── Start ───────────────────────────────────────────── */
document.getElementById('startBtn').addEventListener('click', function(){
  try { getAC().resume(); } catch(e){}
  resetState();
  updHUD();
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('goScreen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('bars').classList.remove('hidden');
  document.getElementById('ctrl').classList.remove('hidden');
  G.running = true;
  loop();
});

})();
