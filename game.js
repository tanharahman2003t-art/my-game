/* =====================================================
   NEON CHASE — Infinite Runner v5.0
   Clean pseudo-3D road · Infinite play · No bugs
   ===================================================== */
(function () {
  'use strict';

  /* ─── Canvas ───────────────────────────────────── */
  var C   = document.getElementById('gc');
  var ctx = C.getContext('2d');
  var W, H;

  function resize() {
    W = C.width  = window.innerWidth;
    H = C.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ─── Images ───────────────────────────────────── */
  var imgGun   = new Image();
  var imgThief = new Image();
  imgGun.src   = 'gun.png';
  imgThief.src = 'thief.png';

  /* ─── Sound ─────────────────────────────────────── */
  var AC = null;
  function ac() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    return AC;
  }
  function beep(freq, type, dur, vol) {
    try {
      var a = ac(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = type || 'square';
      o.frequency.value = freq;
      o.frequency.exponentialRampToValueAtTime(freq * 0.45, a.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.1, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.start(); o.stop(a.currentTime + dur);
    } catch (e) {}
  }
  var SFX = {
    shoot: function () { beep(820, 'square',  0.06, 0.09); },
    hit:   function () { beep(200, 'sawtooth',0.14, 0.22); setTimeout(function(){ beep(420,'sine',0.08,0.1); }, 50); },
    crash: function () { beep(60,  'sawtooth',0.5,  0.28); },
    pu:    function () {
      beep(440,'sine',0.06,0.12);
      setTimeout(function(){ beep(660,'sine',0.06,0.12); }, 80);
      setTimeout(function(){ beep(880,'sine',0.10,0.12); }, 160);
    },
  };

  /* ─── 3D Road Math ──────────────────────────────── */
  /*
     The road is a trapezoid.
     horizon at HORIZ_F * H from top.
     At the bottom (y=H) road is ROAD_BOTTOM wide.
     Everything scales linearly between horizon and bottom.

     For a point at world-depth t (0=horizon, 1=bottom of screen):
       screenY = HY + t*(H-HY)
       halfRoad = ROAD_BOTTOM/2 * t
       laneX = center + (lane - 1) * laneSpacing * t
  */
  var HORIZ_F    = 0.38;   // horizon fraction of H
  var ROAD_BOT_F = 0.82;   // road width fraction of W at bottom
  var LANES      = 3;

  /* get screen coords for (lane 0-2, depth t 0-1) */
  function roadPoint(lane, t) {
    var hy   = H * HORIZ_F;
    var sy   = hy + t * (H - hy);
    var half = W * ROAD_BOT_F * 0.5 * t;
    var lw   = (half * 2) / LANES;
    var x    = W * 0.5 - half + lw * (lane + 0.5);
    return { x: x, y: sy, scale: t };
  }

  /* road left/right edge at depth t */
  function roadEdgeX(side, t) { // side: -1 or 1
    var half = W * ROAD_BOT_F * 0.5 * t;
    return W * 0.5 + side * half;
  }

  /* ─── Game State ────────────────────────────────── */
  var PLAYER_T = 0.90;   // player depth (close = big)
  var THIEF_T  = 0.18;   // thief depth  (far  = small)

  var G = {
    running: false,
    frame:   0,
    score:   0,
    level:   1,
    lives:   3,

    playerLane:   1,
    shootCooldown:0,
    pFlash:       0,
    shieldOn:     false,
    shieldTimer:  0,
    rapidOn:      false,
    rapidTimer:   0,

    thiefLane:    1,
    tFlash:       0,
    tTimer:       80,  // countdown to next thief lane change

    obstacles: [],
    powerups:  [],
    bullets:   [],
    particles: [],

    combo:      0,
    comboTimer: 0,
    flashTimer: 0,
    flashColor: 'rgba(255,0,0,0.18)',

    /* infinite progress */
    dist: 0,       // total distance scrolled

    raf: null,
  };

  /* ─── Road scroll ────────────────────────────────── */
  var scroll = 0;   // 0-1 fraction for stripe offset

  /* ─── Starfield ─────────────────────────────────── */
  var STARS = [];
  for (var si = 0; si < 130; si++) {
    STARS.push({
      x: Math.random(),
      y: Math.random() * HORIZ_F,
      r: Math.random() * 1.4 + 0.2,
      b: Math.random() * 0.5 + 0.25,
      s: Math.random() * 0.00015 + 0.00005,
    });
  }

  /* ─── Helpers ────────────────────────────────────── */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* roundRect compat */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);      ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);      ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);          ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  /* ─── Draw Sky ───────────────────────────────────── */
  function drawSky() {
    var hy = H * HORIZ_F;
    var sg = ctx.createLinearGradient(0, 0, 0, hy);
    sg.addColorStop(0,    '#020310');
    sg.addColorStop(0.55, '#06071a');
    sg.addColorStop(1,    '#0e0828');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, hy);

    /* city glow near horizon */
    var cg = ctx.createRadialGradient(W / 2, hy, 0, W / 2, hy, W * 0.52);
    cg.addColorStop(0,   'rgba(70,0,160,0.42)');
    cg.addColorStop(0.45,'rgba(30,0,80,0.18)');
    cg.addColorStop(1,   'transparent');
    ctx.fillStyle = cg;
    ctx.fillRect(0, hy * 0.25, W, hy * 0.8);

    /* stars */
    for (var i = 0; i < STARS.length; i++) {
      var s  = STARS[i];
      s.x = (s.x + s.s) % 1;
      var tw = 0.6 + 0.4 * Math.sin(G.frame * 0.013 + s.x * 12);
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (s.b * tw).toFixed(2) + ')';
      ctx.fill();
    }
  }

  /* ─── Draw Road ──────────────────────────────────── */
  function drawRoad() {
    var hy   = H * HORIZ_F;
    var near = { x0: roadEdgeX(-1, 1), x1: roadEdgeX(1, 1), y: H };
    var far  = { x0: roadEdgeX(-1, 0.001), x1: roadEdgeX(1, 0.001), y: hy };

    /* road surface */
    ctx.beginPath();
    ctx.moveTo(far.x0,  far.y);
    ctx.lineTo(far.x1,  far.y);
    ctx.lineTo(near.x1, near.y);
    ctx.lineTo(near.x0, near.y);
    ctx.closePath();
    var rg = ctx.createLinearGradient(0, hy, 0, H);
    rg.addColorStop(0,    '#0b0820');
    rg.addColorStop(0.38, '#120b2c');
    rg.addColorStop(1,    '#1c1040');
    ctx.fillStyle = rg;
    ctx.fill();

    /* perspective grid stripes - horizontal */
    var ROW = 24;
    var spd = 0.36 * (1 + (G.level - 1) * 0.11);
    scroll  = (scroll + spd) % (H / ROW);

    for (var r = 0; r <= ROW + 1; r++) {
      var yf = ((r / ROW) + scroll / H) % 1.0;
      var sy = hy + yf * (H - hy);
      if (sy < hy || sy > H + 2) continue;
      var den = sy - hy;
      if (den < 0.5) continue;
      /* recover t from screenY */
      var t2  = (sy - hy) / (H - hy);
      var lx  = roadEdgeX(-1, t2);
      var rx  = roadEdgeX( 1, t2);
      ctx.beginPath();
      ctx.moveTo(lx, sy); ctx.lineTo(rx, sy);
      ctx.strokeStyle = (r % 2 === 0) ? 'rgba(0,210,255,0.12)' : 'rgba(130,0,255,0.07)';
      ctx.lineWidth   = (r % 2 === 0) ? 1 : 0.5;
      ctx.stroke();
    }

    /* lane dividers */
    for (var lane = 1; lane < LANES; lane++) {
      var frac = lane / LANES;
      var nearX = near.x0 + (near.x1 - near.x0) * frac;
      var farX  = far.x0  + (far.x1  - far.x0)  * frac;
      var ld = ctx.createLinearGradient(0, hy, 0, H);
      ld.addColorStop(0,    'rgba(0,242,255,0.00)');
      ld.addColorStop(0.4,  'rgba(0,242,255,0.20)');
      ld.addColorStop(1,    'rgba(0,242,255,0.48)');
      ctx.beginPath();
      ctx.moveTo(farX, hy); ctx.lineTo(nearX, H);
      ctx.strokeStyle = ld;
      ctx.lineWidth   = 1.8;
      ctx.stroke();
    }

    /* glowing edge lines */
    var edges = [['#00f2ff', -1], ['#ff00ea', 1]];
    for (var ei = 0; ei < edges.length; ei++) {
      var col  = edges[ei][0];
      var side = edges[ei][1];
      ctx.save();
      ctx.shadowBlur   = 16; ctx.shadowColor = col;
      ctx.strokeStyle  = col;
      ctx.lineWidth    = 2.8;
      ctx.globalAlpha  = 0.75;
      ctx.beginPath();
      ctx.moveTo(roadEdgeX(side, 0.001), hy);
      ctx.lineTo(roadEdgeX(side, 1),     H);
      ctx.stroke();
      ctx.restore();
    }

    /* dark shoulders */
    ctx.fillStyle = '#050316';
    ctx.fillRect(0, hy, near.x0, H - hy);
    ctx.fillRect(near.x1, hy, W - near.x1, H - hy);

    /* horizon line */
    ctx.save();
    var hl = ctx.createLinearGradient(0, 0, W, 0);
    hl.addColorStop(0,    'transparent');
    hl.addColorStop(0.25, '#00f2ff');
    hl.addColorStop(0.75, '#ff00ea');
    hl.addColorStop(1,    'transparent');
    ctx.strokeStyle = hl; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke();
    ctx.restore();
  }

  /* ─── Draw Sprite ────────────────────────────────── */
  function drawSprite(lane, t, isPlayer, flash) {
    var p  = roadPoint(lane, t);
    var sc = p.scale;

    /* sizes: player = police gun-car (small), thief = character (big at horizon) */
    var bw, bh;
    if (isPlayer) {
      /* player car — moderate size at bottom */
      bw = clamp(W * 0.13, 52, 110) * (sc / PLAYER_T);
      bh = bw * 1.45;
    } else {
      /* thief — bigger relative to their depth */
      bw = clamp(W * 0.16, 60, 130) * (sc / THIEF_T);
      bh = bw * 1.35;
    }

    var dx = p.x - bw * 0.5;
    var dy = p.y - bh;

    ctx.save();
    if (flash > 0) ctx.globalAlpha = 0.4 + 0.6 * (Math.sin(G.frame * 1.6) * 0.5 + 0.5);

    /* ground shadow */
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle    = isPlayer ? (G.shieldOn ? '#00ff9d' : '#00ccff') : '#ff0044';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + bh * 0.02, bw * 0.44, bh * 0.052, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (flash > 0) ctx.globalAlpha = 0.4 + 0.6 * (Math.sin(G.frame * 1.6) * 0.5 + 0.5);

    var img = isPlayer ? imgGun : imgThief;
    if (img.complete && img.naturalWidth > 0) {
      if (isPlayer && G.shieldOn) { ctx.shadowBlur = 28 * sc; ctx.shadowColor = '#00ff9d'; }
      ctx.drawImage(img, dx, dy, bw, bh);
      ctx.shadowBlur = 0;
    } else {
      drawCar(p.x, p.y, bw, bh, isPlayer, sc);
    }

    ctx.globalAlpha = 1;

    /* shield bubble */
    if (isPlayer && G.shieldOn) {
      var pulse = 0.5 + 0.5 * Math.sin(G.frame * 0.15);
      ctx.save();
      ctx.globalAlpha  = pulse * 0.6;
      ctx.strokeStyle  = '#00ff9d';
      ctx.lineWidth    = 2.5 * sc;
      ctx.shadowBlur   = 20 * sc; ctx.shadowColor = '#00ff9d';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - bh * 0.42, bw * 0.6, bh * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* thief arrow pointer */
    if (!isPlayer) {
      var asz = clamp(8 * sc, 6, 14);
      ctx.save();
      ctx.fillStyle   = '#ff0044';
      ctx.shadowBlur  = 10 * sc; ctx.shadowColor = '#ff0044';
      ctx.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin(G.frame * 0.11));
      ctx.beginPath();
      ctx.moveTo(p.x,        p.y + asz * 0.4);
      ctx.lineTo(p.x - asz,  p.y + asz * 2);
      ctx.lineTo(p.x + asz,  p.y + asz * 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  /* fallback car shapes */
  function drawCar(cx, botY, w, h, isPlayer, sc) {
    ctx.save();
    if (isPlayer) {
      ctx.fillStyle  = G.shieldOn ? '#00ff9d' : '#00e8ff';
      ctx.shadowBlur = 20 * sc; ctx.shadowColor = ctx.fillStyle;
      rr(cx - w*0.37, botY - h*0.77, w*0.74, h*0.63, 8*sc); ctx.fill();

      ctx.fillStyle  = 'rgba(0,25,70,0.9)';
      ctx.shadowBlur = 0;
      rr(cx - w*0.23, botY - h*0.77, w*0.46, h*0.28, 5*sc); ctx.fill();
      ctx.strokeStyle = 'rgba(0,242,255,0.45)'; ctx.lineWidth = 1*sc; ctx.stroke();

      ctx.fillStyle = '#ffffffcc'; ctx.shadowBlur = 8*sc; ctx.shadowColor = '#fff';
      ctx.fillRect(cx - 3*sc, botY - h, 6*sc, h*0.25);

      ctx.fillStyle = '#fff'; ctx.shadowBlur = 10*sc; ctx.shadowColor = '#fff';
      ctx.beginPath(); ctx.arc(cx - w*0.32, botY - h*0.63, 4.5*sc, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + w*0.32, botY - h*0.63, 4.5*sc, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = 'rgba(0,230,255,0.22)'; ctx.shadowBlur = 18*sc; ctx.shadowColor = '#00e8ff';
      ctx.beginPath(); ctx.ellipse(cx, botY - h*0.06, w*0.46, h*0.065, 0, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle  = '#e80040';
      ctx.shadowBlur = 22*sc; ctx.shadowColor = '#ff0044';
      rr(cx - w*0.40, botY - h*0.80, w*0.80, h*0.68, 8*sc); ctx.fill();

      ctx.fillStyle  = 'rgba(45,0,22,0.92)';
      ctx.shadowBlur = 0;
      rr(cx - w*0.25, botY - h*0.80, w*0.50, h*0.30, 5*sc); ctx.fill();
      ctx.strokeStyle = 'rgba(255,0,60,0.4)'; ctx.lineWidth = 1*sc; ctx.stroke();

      ctx.fillStyle = '#ff6500'; ctx.shadowBlur=12*sc; ctx.shadowColor='#ff6500';
      ctx.beginPath(); ctx.arc(cx - w*0.13, botY - h*0.84, 5.5*sc, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff0028'; ctx.shadowColor='#ff0028';
      ctx.beginPath(); ctx.arc(cx + w*0.13, botY - h*0.84, 5.5*sc, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = 'rgba(255,0,50,0.20)'; ctx.shadowBlur=18*sc; ctx.shadowColor='#ff0044';
      ctx.beginPath(); ctx.ellipse(cx, botY - h*0.06, w*0.46, h*0.065, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  /* ─── Draw Bullets ───────────────────────────────── */
  function drawBullets() {
    for (var i = 0; i < G.bullets.length; i++) {
      var b   = G.bullets[i];
      var p   = roadPoint(b.lane, b.t);
      var sc  = p.scale;
      var bw  = 7 * sc, bh = 20 * sc;

      /* trail */
      for (var ti = 0; ti < b.trail.length; ti++) {
        var tr = b.trail[ti];
        var tp = roadPoint(b.lane, tr);
        var ts = tp.scale;
        ctx.globalAlpha = (ti / b.trail.length) * 0.4;
        ctx.fillStyle   = '#00f2ff';
        ctx.fillRect(tp.x - bw*0.4, tp.y - bh*0.4, bw*0.8, bh*0.8);
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.fillStyle   = '#ffffff';
      ctx.shadowBlur  = 16 * sc; ctx.shadowColor = '#00f2ff';
      ctx.fillRect(p.x - bw/2, p.y - bh, bw, bh);
      ctx.fillStyle = '#00f2ff';
      ctx.beginPath(); ctx.arc(p.x, p.y - bh, bw/2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  /* ─── Draw Obstacle ──────────────────────────────── */
  function drawObstacle(o) {
    var p  = roadPoint(o.lane, o.t);
    var sc = p.scale;
    var ow = 64 * sc, oh = 56 * sc;

    ctx.save();
    ctx.translate(p.x, p.y - oh * 0.5);
    ctx.rotate(o.spin);

    ctx.fillStyle  = '#be00cc';
    ctx.shadowBlur = 22 * sc; ctx.shadowColor = '#ff00ea';
    rr(-ow/2, -oh/2, ow, oh, 7*sc); ctx.fill();

    ctx.fillStyle  = '#ff44ff'; ctx.shadowBlur = 0;
    rr(-ow*0.28, -oh*0.28, ow*0.56, oh*0.56, 4*sc); ctx.fill();

    ctx.fillStyle    = '#fff';
    ctx.font         = 'bold ' + Math.max(9, Math.round(22 * sc)) + 'px sans-serif';
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#ff00ea';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4*sc, ow*0.42, 7*sc, 0, 0, Math.PI*2);
    ctx.fill(); ctx.restore();
  }

  /* ─── Draw Power-up ──────────────────────────────── */
  var PU_COL  = { shield:'#00ff9d', rapid:'#ffe600', life:'#ff4466' };
  var PU_ICON = { shield:'S', rapid:'R', life:'♥' };

  function drawPowerup(pu) {
    var p   = roadPoint(pu.lane, pu.t);
    var sc  = p.scale;
    var ps  = 50 * sc;
    var col = PU_COL[pu.type];
    var pulse = 0.65 + 0.35 * Math.abs(Math.sin(G.frame * 0.1));

    ctx.save();
    ctx.translate(p.x, p.y - ps * 0.5);
    ctx.rotate(pu.spin);

    ctx.strokeStyle = col; ctx.lineWidth = 2.5 * sc;
    ctx.shadowBlur  = 22 * sc; ctx.shadowColor = col;
    ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(0, 0, ps * 0.5, 0, Math.PI*2); ctx.stroke();

    ctx.fillStyle   = col + '1c'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0, 0, ps * 0.38, 0, Math.PI*2); ctx.fill();

    ctx.shadowBlur     = 0; ctx.fillStyle = col;
    ctx.font           = 'bold ' + Math.max(8, Math.round(16*sc)) + 'px Orbitron,monospace';
    ctx.textAlign      = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(PU_ICON[pu.type], 0, 1);
    ctx.restore();
  }

  /* ─── Particles ──────────────────────────────────── */
  function spawnParts(x, y, col, n) {
    for (var i = 0; i < (n || 14); i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 5 + 1.5;
      G.particles.push({
        x:x, y:y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
        r:Math.random()*4+1.5, col:col, life:1,
        dec:Math.random()*0.022+0.025
      });
    }
  }

  function tickParts() {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i];
      p.x  += p.vx; p.y += p.vy; p.vy += 0.13;
      p.r  *= 0.965; p.life -= p.dec;
      if (p.life <= 0) G.particles.splice(i, 1);
    }
  }

  function drawParts() {
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.col; ctx.shadowBlur = 7; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  /* ─── Collision: depth tolerance ─────────────────── */
  function depthHit(at, bt, tol) { return Math.abs(at - bt) < tol; }

  /* screen position for particle spawn */
  function screenPos(lane, t) {
    var p = roadPoint(lane, t);
    return { x: p.x, y: p.y - 60 * p.scale };
  }

  /* ─── Obstacle spawn ─────────────────────────────── */
  function spawnObs() {
    /* avoid spawning in same lane as player back-to-back */
    var lane;
    do { lane = Math.floor(Math.random() * LANES); } while (Math.random() < 0.3 && lane === G.playerLane);
    G.obstacles.push({ lane:lane, t:0.02, spin:0 });
  }

  /* ─── Powerup spawn ──────────────────────────────── */
  var PU_TYPES = ['shield','rapid','life'];
  function spawnPU() {
    G.powerups.push({
      lane: Math.floor(Math.random() * LANES),
      t:    0.02,
      type: PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)],
      spin: 0,
    });
  }

  /* ─── HUD update ─────────────────────────────────── */
  function updHUD() {
    document.getElementById('hScore').textContent  = Math.floor(G.score);
    document.getElementById('hLevel').textContent  = G.level;
    var lv = '';
    for (var i = 0; i < 3; i++) lv += (i < G.lives ? '❤' : '🖤');
    document.getElementById('hLives').textContent = lv;

    var sb = document.getElementById('shieldBar');
    var rb = document.getElementById('rapidBar');
    if (G.shieldOn) {
      sb.classList.remove('hidden');
      document.getElementById('shieldFill').style.width = (G.shieldTimer / 330 * 100) + '%';
    } else sb.classList.add('hidden');
    if (G.rapidOn) {
      rb.classList.remove('hidden');
      document.getElementById('rapidFill').style.width = (G.rapidTimer / 270 * 100) + '%';
    } else rb.classList.add('hidden');
  }

  /* ─── Banner ─────────────────────────────────────── */
  var banTid = null;
  function banner(msg) {
    var el = document.getElementById('banner');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(banTid);
    banTid = setTimeout(function () { el.classList.remove('show'); }, 1300);
  }

  /* ─── Tick (game logic) ──────────────────────────── */
  function tick() {
    G.frame++;
    G.dist += 1;

    /* score + level — infinite: level every 500 distance */
    G.score += 0.15 + (G.level - 1) * 0.04;
    G.level  = 1 + Math.floor(G.dist / 500);

    /* timers */
    if (G.shieldTimer > 0) G.shieldTimer--; else G.shieldOn = false;
    if (G.rapidTimer  > 0) G.rapidTimer--;  else G.rapidOn  = false;
    if (G.comboTimer  > 0) G.comboTimer--;  else G.combo     = 0;
    if (G.flashTimer  > 0) G.flashTimer--;
    if (G.pFlash      > 0) G.pFlash--;
    if (G.tFlash      > 0) G.tFlash--;

    /* auto-shoot when aligned */
    if (G.shootCooldown > 0) G.shootCooldown--;
    if (G.playerLane === G.thiefLane && G.shootCooldown <= 0) {
      G.bullets.push({ lane: G.playerLane, t: PLAYER_T - 0.06, trail: [] });
      SFX.shoot();
      G.shootCooldown = G.rapidOn ? 14 : 26;
    }

    /* thief lane AI */
    if (--G.tTimer <= 0) {
      G.thiefLane = Math.floor(Math.random() * LANES);
      G.tTimer    = Math.max(24, 78 - G.level * 7);
    }

    /* ── Bullets ── */
    var bSpd = 0.028 + G.level * 0.002;
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.trail.push(b.t);
      if (b.trail.length > 7) b.trail.shift();
      b.t += bSpd;

      if (b.lane === G.thiefLane && depthHit(b.t, THIEF_T, 0.1)) {
        /* HIT */
        G.combo++;
        G.comboTimer = 110;
        var pts = 10 + (G.combo > 1 ? G.combo * 6 : 0);
        G.score += pts;
        G.tFlash  = 18;
        var sp1 = screenPos(G.thiefLane, THIEF_T);
        spawnParts(sp1.x, sp1.y, '#ff0044', 22);
        G.flashTimer = 7; G.flashColor = 'rgba(255,0,80,0.11)';
        SFX.hit();
        if (G.combo > 1) banner('COMBO \u00d7' + G.combo + '  +' + pts);
        G.bullets.splice(i, 1);
        updHUD();
        continue;
      }
      if (b.t > THIEF_T + 0.15) G.bullets.splice(i, 1);
    }

    /* ── Obstacles ── */
    var obsRate = Math.max(44, 95 - G.level * 8);
    if (G.frame % obsRate === 0) spawnObs();

    var oSpd = 0.007 + G.level * 0.0007;
    for (var oi = G.obstacles.length - 1; oi >= 0; oi--) {
      var o = G.obstacles[oi];
      o.t   += oSpd; o.spin += 0.036;
      if (o.t > 1.05) { G.obstacles.splice(oi, 1); continue; }
      if (o.lane === G.playerLane && depthHit(o.t, PLAYER_T, 0.07)) {
        var sp2 = screenPos(G.playerLane, PLAYER_T);
        if (G.shieldOn) {
          G.shieldOn = false; G.shieldTimer = 0;
          spawnParts(sp2.x, sp2.y, '#00ff9d', 18);
          SFX.pu(); banner('SHIELD BLOCKED!');
        } else {
          G.lives--;
          G.pFlash  = 24;
          G.flashTimer = 22; G.flashColor = 'rgba(255,0,0,0.22)';
          spawnParts(sp2.x, sp2.y, '#ff3333', 28);
          SFX.crash();
          if (G.lives <= 0) { endGame(); return; }
        }
        G.obstacles.splice(oi, 1);
        updHUD();
      }
    }

    /* ── Power-ups ── */
    if (G.frame % 220 === 0) spawnPU();
    var puSpd = 0.005;
    for (var pi = G.powerups.length - 1; pi >= 0; pi--) {
      var pu = G.powerups[pi];
      pu.t  += puSpd; pu.spin += 0.06;
      if (pu.t > 1.05) { G.powerups.splice(pi, 1); continue; }
      if (pu.lane === G.playerLane && depthHit(pu.t, PLAYER_T, 0.08)) {
        SFX.pu();
        var sp3 = screenPos(G.playerLane, PLAYER_T);
        spawnParts(sp3.x, sp3.y, PU_COL[pu.type], 16);
        if (pu.type === 'shield') { G.shieldOn=true;  G.shieldTimer=330; banner('\u26a1 SHIELD ONLINE'); }
        if (pu.type === 'rapid')  { G.rapidOn =true;  G.rapidTimer =270; banner('\ud83d\udd25 RAPID FIRE'); }
        if (pu.type === 'life' && G.lives < 3) { G.lives++; updHUD(); banner('\u2764 EXTRA LIFE'); }
        G.powerups.splice(pi, 1);
        updHUD();
      }
    }

    tickParts();
  }

  /* ─── Render ─────────────────────────────────────── */
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawRoad();

    if (G.flashTimer > 0) {
      ctx.fillStyle = G.flashColor;
      ctx.fillRect(0, 0, W, H);
    }

    /* sort obstacles + powerups far→near */
    var objs = [];
    for (var i = 0; i < G.obstacles.length; i++) objs.push({ t:G.obstacles[i].t, fn:G.obstacles[i], type:'o' });
    for (var i = 0; i < G.powerups.length;  i++) objs.push({ t:G.powerups[i].t,  fn:G.powerups[i],  type:'p' });
    objs.sort(function (a, b) { return a.t - b.t; });
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].type === 'o') drawObstacle(objs[i].fn);
      else                       drawPowerup(objs[i].fn);
    }

    drawSprite(G.thiefLane,  THIEF_T,  false, G.tFlash);
    drawBullets();
    drawParts();
    drawSprite(G.playerLane, PLAYER_T, true,  G.pFlash);

    /* combo text on canvas */
    if (G.combo > 1 && G.comboTimer > 0) {
      var alpha = Math.min(1, G.comboTimer / 40);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#ffe600'; ctx.shadowBlur = 18; ctx.shadowColor = '#ffe600';
      var fs = clamp(Math.round(W * 0.042), 18, 30);
      ctx.font       = '900 ' + fs + 'px Orbitron,monospace';
      ctx.textAlign  = 'center';
      ctx.fillText('\u00d7' + G.combo + ' COMBO', W * 0.5, H * 0.48);
      ctx.restore();
    }

    /* active power-up labels */
    var labelY = H * HORIZ_F + 22;
    if (G.rapidOn) {
      ctx.save(); ctx.fillStyle='#ffe600'; ctx.shadowBlur=8; ctx.shadowColor='#ffe600';
      ctx.font='bold 11px Orbitron,monospace'; ctx.textAlign='right';
      ctx.fillText('RAPID', W-16, labelY); ctx.restore();
    }
    if (G.shieldOn) {
      ctx.save(); ctx.fillStyle='#00ff9d'; ctx.shadowBlur=8; ctx.shadowColor='#00ff9d';
      ctx.font='bold 11px Orbitron,monospace'; ctx.textAlign='left';
      ctx.fillText('SHIELD', 16, labelY); ctx.restore();
    }
  }

  /* ─── Loop ───────────────────────────────────────── */
  function loop() {
    if (!G.running) return;
    tick();
    render();
    G.raf = requestAnimationFrame(loop);
  }

  /* ─── End game ───────────────────────────────────── */
  function endGame() {
    G.running = false;
    cancelAnimationFrame(G.raf);
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('hud-bottom').classList.add('hidden');
    document.getElementById('touch-ctrl').classList.add('hidden');

    var go = document.getElementById('goScreen');
    go.classList.remove('hidden');
    document.getElementById('goLabel').textContent = 'MISSION FAILED';
    document.getElementById('goBig').textContent   = 'ELIMINATED';
    document.getElementById('goStats').innerHTML   =
      'SCORE &nbsp; ' + Math.floor(G.score) + '<br>' +
      'LEVEL &nbsp; ' + G.level + '<br>' +
      'DISTANCE &nbsp; ' + G.dist + 'm';
  }

  /* ─── Input ──────────────────────────────────────── */
  function goLeft()  { if (G.running && G.playerLane > 0)             G.playerLane--; }
  function goRight() { if (G.running && G.playerLane < LANES - 1)    G.playerLane++; }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goLeft();  }
    if (e.key === 'ArrowRight') { e.preventDefault(); goRight(); }
  });

  function bindTouch(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive:false });
    el.addEventListener('mousedown',  fn);
  }
  bindTouch('tLeft',  goLeft);
  bindTouch('tRight', goRight);

  /* swipe support */
  var swipeX = null;
  window.addEventListener('touchstart', function (e) { swipeX = e.touches[0].clientX; }, { passive:true });
  window.addEventListener('touchend',   function (e) {
    if (swipeX === null) return;
    var dx = e.changedTouches[0].clientX - swipeX;
    if (Math.abs(dx) > 40) { dx < 0 ? goLeft() : goRight(); }
    swipeX = null;
  });

  /* ─── Start ──────────────────────────────────────── */
  document.getElementById('startBtn').addEventListener('click', function () {
    try { ac().resume(); } catch (e) {}

    /* reset */
    G.running=false; G.frame=0; G.score=0; G.level=1; G.lives=3; G.dist=0;
    G.playerLane=1; G.shootCooldown=0; G.pFlash=0;
    G.shieldOn=false; G.shieldTimer=0;
    G.rapidOn=false;  G.rapidTimer=0;
    G.thiefLane=1; G.tFlash=0; G.tTimer=80;
    G.bullets=[]; G.obstacles=[]; G.powerups=[]; G.particles=[];
    G.combo=0; G.comboTimer=0; G.flashTimer=0;
    scroll=0;

    updHUD();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('goScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hud-bottom').classList.remove('hidden');
    document.getElementById('touch-ctrl').classList.remove('hidden');

    G.running = true;
    loop();
  });

})();
