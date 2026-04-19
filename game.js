/* ============================================================
   NEON CHASE — game.js  (Rewritten v2)
   ✅ Thief clearly visible with glowing silhouette + label
   ✅ Beautiful road with proper perspective & glow
   ✅ All bugs from v1 fixed (var redeclaration, bullet logic)
   ✅ Better image fallback for thief (humanoid shape)
   ✅ Tighter bullet hit detection
   ✅ Combo system, powerups, lives all working
   ✅ Mobile touch + swipe support
   ✅ Smooth infinite runner
============================================================ */
(function () {
  'use strict';

  /* ── Canvas ─────────────────────────────────── */
  var C = document.getElementById('gc');
  var ctx = C.getContext('2d');
  var W, H, HY; // HY = horizon Y position

  function resize() {
    W = C.width  = window.innerWidth;
    H = C.height = window.innerHeight;
    HY = Math.floor(H * 0.38);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Images ──────────────────────────────────── */
  var imgPlayer = new Image();
  var imgThief  = new Image();
  imgPlayer.src = 'gun.png';
  imgThief.src  = 'thief.png';
  imgPlayer.onerror = function(){ imgPlayer._failed = true; };
  imgThief.onerror  = function(){ imgThief._failed  = true; };

  /* ── Audio ───────────────────────────────────── */
  var AudioCtx = null;
  function getAC() {
    if (!AudioCtx) AudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return AudioCtx;
  }
  function beep(hz, type, dur, vol) {
    try {
      var a = getAC(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = type; o.frequency.value = hz;
      o.frequency.exponentialRampToValueAtTime(hz * 0.4, a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.start(); o.stop(a.currentTime + dur);
    } catch(e) {}
  }
  var SFX = {
    shoot: function(){ beep(820, 'square', 0.06, 0.08); },
    hit:   function(){ beep(180, 'sawtooth', 0.14, 0.22); setTimeout(function(){ beep(380, 'sine', 0.08, 0.09); }, 50); },
    crash: function(){ beep(55, 'sawtooth', 0.50, 0.28); },
    pu:    function(){ beep(440,'sine',0.05,0.12); setTimeout(function(){ beep(660,'sine',0.05,0.12); },70); setTimeout(function(){ beep(880,'sine',0.10,0.12); },140); },
    combo: function(){ beep(1100, 'sine', 0.07, 0.13); }
  };

  /* ── Road / perspective constants ───────────── */
  var ROAD_W = 0.80;   // road width fraction at bottom
  var NLANES  = 3;
  var PT      = 0.92;  // player depth (near bottom)
  var TT      = 0.18;  // thief depth (near horizon)

  /* Depth t: 0=horizon, 1=bottom */
  function toScreen(lane, t) {
    var y    = HY + t * (H - HY);
    var half = W * ROAD_W * 0.5 * t;
    var lw   = (half * 2) / NLANES;
    var x    = W * 0.5 - half + lw * (lane + 0.5);
    return { x: x, y: y, sc: t };
  }

  function edgeX(side, t) {
    return W * 0.5 + side * W * ROAD_W * 0.5 * t;
  }

  /* ── Starfield ───────────────────────────────── */
  var stars = [];
  for (var _si = 0; _si < 180; _si++) {
    stars.push({
      x: Math.random(), y: Math.random() * 0.36,
      r: Math.random() * 1.6 + 0.2,
      b: Math.random() * 0.5 + 0.25,
      spd: Math.random() * 0.00012 + 0.00002
    });
  }

  /* ── Particles ───────────────────────────────── */
  var particles = [];
  function burst(x, y, col, n) {
    for (var i = 0; i < (n || 14); i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * 5 + 1.5;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: Math.random() * 4 + 1.5,
        col: col, life: 1,
        fade: Math.random() * 0.022 + 0.024
      });
    }
  }
  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12;
      p.r  *= 0.97; p.life -= p.fade;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.col;
      ctx.shadowBlur  = 8; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* ── Road scroll offset ──────────────────────── */
  var roadOff = 0;

  /* ── Game state ──────────────────────────────── */
  var G = {};
  function resetGame() {
    G = {
      on: false, frame: 0, score: 0, dist: 0, level: 1, lives: 3,
      lane: 1, shootCD: 0, pFlash: 0,
      shieldOn: false, shieldT: 0,
      rapidOn: false,  rapidT: 0,
      tLane: 1, tFlash: 0, tCD: 70,
      bullets: [], obs: [], pups: [],
      combo: 0, comboCD: 0,
      flashT: 0, flashCol: 'rgba(255,0,0,0.2)',
      raf: null
    };
    particles = []; roadOff = 0;
  }

  /* ── Draw sky ────────────────────────────────── */
  function drawSky() {
    // Deep space gradient
    var g = ctx.createLinearGradient(0, 0, 0, HY);
    g.addColorStop(0,   '#010208');
    g.addColorStop(0.5, '#040515');
    g.addColorStop(1,   '#0a0622');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HY);

    // City glow at horizon — WIDER and more dramatic
    var cg = ctx.createRadialGradient(W/2, HY, 0, W/2, HY, W * 0.65);
    cg.addColorStop(0,   'rgba(100, 0, 220, 0.55)');
    cg.addColorStop(0.3, 'rgba(0, 180, 255, 0.18)');
    cg.addColorStop(0.7, 'rgba(40, 0, 100, 0.10)');
    cg.addColorStop(1,   'transparent');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, HY + 20);

    // Twinkling stars
    ctx.save();
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.x = (s.x + s.spd) % 1;
      var tw = 0.5 + 0.5 * Math.sin(G.frame * 0.014 + s.x * 9);
      var alpha = (s.b * tw).toFixed(2);
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.fill();
    }
    ctx.restore();

    // Distant city silhouette at horizon
    drawCitySilhouette();
  }

  function drawCitySilhouette() {
    ctx.save();
    ctx.globalAlpha = 0.22;
    var bldW = W / 28;
    for (var i = 0; i < 28; i++) {
      var bx = i * bldW;
      var bh = (Math.sin(i * 2.7 + 1) * 0.5 + 0.5) * HY * 0.42 + HY * 0.04;
      // alternating colors for vibrancy
      if (i % 3 === 0)      ctx.fillStyle = '#2200aa';
      else if (i % 3 === 1) ctx.fillStyle = '#001166';
      else                   ctx.fillStyle = '#110044';
      ctx.fillRect(bx, HY - bh, bldW - 1, bh);
      // window lights
      ctx.fillStyle = 'rgba(0,200,255,0.6)';
      for (var wy = 4; wy < bh - 4; wy += 7) {
        if (Math.random() > 0.55) ctx.fillRect(bx + 2, HY - bh + wy, 3, 4);
      }
    }
    ctx.restore();
  }

  /* ── Draw road ───────────────────────────────── */
  function drawRoad() {
    var nL = edgeX(-1, 1),   nR = edgeX(1, 1);
    var fL = edgeX(-1, 0.001), fR = edgeX(1, 0.001);

    /* Road surface */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fL, HY); ctx.lineTo(fR, HY);
    ctx.lineTo(nR, H);  ctx.lineTo(nL, H);
    ctx.closePath();
    var rg = ctx.createLinearGradient(0, HY, 0, H);
    rg.addColorStop(0,   '#07051a');
    rg.addColorStop(0.3, '#0d0929');
    rg.addColorStop(0.7, '#130f38');
    rg.addColorStop(1,   '#1c1348');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.restore();

    /* Scrolling grid lines (perspective-correct) */
    var ROWS = 24;
    var speed = 0.38 + (G.level - 1) * 0.08;
    roadOff = (roadOff + speed) % (H / ROWS);

    for (var r = 0; r <= ROWS + 1; r++) {
      var yf  = ((r / ROWS) + (roadOff / H)) % 1.0;
      var sy  = HY + yf * (H - HY);
      if (sy < HY || sy > H + 1) continue;
      var td  = (sy - HY) / (H - HY);
      if (td < 0.001) continue;
      var lx = edgeX(-1, td);
      var rx = edgeX(1,  td);
      ctx.beginPath(); ctx.moveTo(lx, sy); ctx.lineTo(rx, sy);
      // brighter lines closer to camera
      var alpha = td * 0.25;
      ctx.strokeStyle = r % 2 === 0
        ? 'rgba(0,200,255,' + alpha.toFixed(2) + ')'
        : 'rgba(140,0,255,' + (alpha * 0.5).toFixed(2) + ')';
      ctx.lineWidth = td * 1.2 + 0.3;
      ctx.stroke();
    }

    /* Lane dividers */
    for (var l = 1; l < NLANES; l++) {
      var f  = l / NLANES;
      var nx = nL + (nR - nL) * f;
      var fx = fL + (fR - fL) * f;
      var ld = ctx.createLinearGradient(0, HY, 0, H);
      ld.addColorStop(0,    'rgba(0,242,255,0.00)');
      ld.addColorStop(0.35, 'rgba(0,242,255,0.20)');
      ld.addColorStop(1,    'rgba(0,242,255,0.55)');
      ctx.beginPath(); ctx.moveTo(fx, HY); ctx.lineTo(nx, H);
      ctx.strokeStyle = ld; ctx.lineWidth = 2; ctx.stroke();
    }

    /* Glowing edge lines */
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 28; ctx.shadowColor = '#00f2ff';
    ctx.strokeStyle = '#00f2ff'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(fL, HY); ctx.lineTo(nL, H); ctx.stroke();
    ctx.shadowColor = '#cc00ff'; ctx.strokeStyle = '#cc00ff';
    ctx.beginPath(); ctx.moveTo(fR, HY); ctx.lineTo(nR, H); ctx.stroke();
    ctx.restore();

    /* Dark shoulders */
    ctx.fillStyle = '#040110';
    ctx.fillRect(0, HY, nL, H - HY);
    ctx.fillRect(nR, HY, W - nR, H - HY);

    /* Horizon glow line */
    ctx.save();
    var hl = ctx.createLinearGradient(0, 0, W, 0);
    hl.addColorStop(0,   'transparent');
    hl.addColorStop(0.15,'#00f2ff');
    hl.addColorStop(0.5, '#ffffff');
    hl.addColorStop(0.85,'#cc00ff');
    hl.addColorStop(1,   'transparent');
    ctx.strokeStyle = hl; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.85;
    ctx.shadowBlur = 18; ctx.shadowColor = '#00f2ff';
    ctx.beginPath(); ctx.moveTo(0, HY); ctx.lineTo(W, HY); ctx.stroke();
    ctx.restore();
  }

  /* ── Rounded rect helper ─────────────────────── */
  function rr(x, y, w, h, rad) {
    rad = Math.min(rad, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);     ctx.arcTo(x + w, y,     x + w, y + rad,     rad);
    ctx.lineTo(x + w, y + h - rad); ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);     ctx.arcTo(x,     y + h, x,     y + h - rad, rad);
    ctx.lineTo(x, y + rad);         ctx.arcTo(x,     y,     x + rad, y,          rad);
    ctx.closePath();
  }

  /* ── Draw THIEF (humanoid, clearly visible) ──── */
  function drawThief(lane, t, flash) {
    var pos = toScreen(lane, t);
    var sc  = pos.sc;
    var x   = pos.x, y = pos.y;

    /* Scale: thief is bigger so you can see them clearly */
    var bw = Math.min(W * 0.22, 160) * (sc / TT);
    var bh = bw * 1.6;
    var dx = x - bw / 2, dy = y - bh;

    ctx.save();

    if (flash > 0) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(G.frame * 2.0));
    }

    /* Try real image first */
    if (imgThief.complete && imgThief.naturalWidth > 0 && !imgThief._failed) {
      ctx.shadowBlur  = 30 * sc; ctx.shadowColor = '#ff0044';
      ctx.drawImage(imgThief, dx, dy, bw, bh);
      ctx.shadowBlur  = 0;
    } else {
      /* IMPROVED humanoid fallback — clearly looks like a running person */
      drawThiefFallback(x, y, bw, bh, sc);
    }

    ctx.globalAlpha = 1;

    /* Pulsing "THIEF" label above head — always visible */
    var labelPulse = 0.65 + 0.35 * Math.abs(Math.sin(G.frame * 0.10));
    var labelY     = dy - 8 * sc;
    ctx.save();
    ctx.globalAlpha = labelPulse;
    ctx.font        = 'bold ' + Math.max(8, Math.round(12 * sc)) + 'px Orbitron, monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'bottom';
    ctx.fillStyle   = '#ff0044';
    ctx.shadowBlur  = 14 * sc; ctx.shadowColor = '#ff0044';
    ctx.fillText('THIEF', x, labelY);
    ctx.restore();

    /* Pulsing red arrow indicator below thief */
    var az = Math.max(6 * sc, 4);
    ctx.save();
    ctx.fillStyle  = '#ff0044';
    ctx.shadowBlur = 12 * sc; ctx.shadowColor = '#ff0044';
    ctx.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin(G.frame * 0.13));
    ctx.beginPath();
    ctx.moveTo(x,        y + az * 0.3);
    ctx.lineTo(x - az,   y + az * 2.2);
    ctx.lineTo(x + az,   y + az * 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* Glowing ring around thief for visibility */
    ctx.save();
    var ringR  = bw * 0.55;
    var ringPulse = 0.4 + 0.6 * Math.abs(Math.sin(G.frame * 0.09));
    ctx.globalAlpha  = ringPulse * 0.55;
    ctx.strokeStyle  = '#ff0044';
    ctx.lineWidth    = 2 * sc;
    ctx.shadowBlur   = 20 * sc; ctx.shadowColor = '#ff0044';
    ctx.beginPath();
    ctx.ellipse(x, y - bh * 0.4, ringR, bh * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawThiefFallback(cx, by, bw, bh, sc) {
    /* Humanoid silhouette: head + body + legs + arms */
    ctx.save();

    var headR = bw * 0.18;
    var bodyH = bh * 0.38;
    var bodyW = bw * 0.38;
    var legH  = bh * 0.30;
    var armH  = bh * 0.28;

    var headY = by - bh + headR;
    var bodyY = headY + headR + 2 * sc;
    var bodyX = cx - bodyW / 2;

    /* Glow */
    ctx.shadowBlur = 28 * sc; ctx.shadowColor = '#ff0044';

    /* Running anim — bob legs based on frame */
    var bob = Math.sin(G.frame * 0.35) * 4 * sc;
    var bob2 = -bob;

    /* --- Dark coat / trench coat body --- */
    ctx.fillStyle = '#1a0000';
    rr(bodyX, bodyY, bodyW, bodyH * 0.9, 4 * sc);
    ctx.fill();

    /* Neon red trim on coat */
    ctx.strokeStyle = '#ff0044'; ctx.lineWidth = 1.5 * sc;
    rr(bodyX, bodyY, bodyW, bodyH * 0.9, 4 * sc);
    ctx.stroke();

    /* Legs */
    ctx.fillStyle   = '#110000';
    ctx.shadowBlur  = 10 * sc;
    /* Left leg */
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(cx - bodyW * 0.32, bodyY + bodyH * 0.75, bodyW * 0.25, legH + bob,  [3*sc, 3*sc, 6*sc, 6*sc])
      : ctx.rect(cx - bodyW * 0.32, bodyY + bodyH * 0.75, bodyW * 0.25, legH + bob);
    ctx.fill();
    /* Right leg */
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(cx + bodyW * 0.07,  bodyY + bodyH * 0.75, bodyW * 0.25, legH + bob2, [3*sc, 3*sc, 6*sc, 6*sc])
      : ctx.rect(cx + bodyW * 0.07, bodyY + bodyH * 0.75, bodyW * 0.25, legH + bob2);
    ctx.fill();

    /* Arms */
    ctx.strokeStyle = '#1a0000'; ctx.lineWidth = bodyW * 0.18;
    ctx.lineCap     = 'round'; ctx.shadowBlur = 8 * sc;
    /* Left arm */
    ctx.beginPath();
    ctx.moveTo(bodyX + 2 * sc,       bodyY + bodyH * 0.15);
    ctx.lineTo(bodyX - bodyW * 0.25, bodyY + armH + bob2);
    ctx.stroke();
    /* Right arm */
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW - 2 * sc,  bodyY + bodyH * 0.15);
    ctx.lineTo(bodyX + bodyW + bodyW * 0.25, bodyY + armH + bob);
    ctx.stroke();

    /* Head */
    ctx.shadowBlur  = 20 * sc; ctx.shadowColor = '#ff0044';
    ctx.fillStyle   = '#cc1122';
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill();

    /* Face — white mask vibes */
    ctx.fillStyle   = '#ffcccc'; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(cx, headY + headR * 0.05, headR * 0.72, 0, Math.PI * 2); ctx.fill();

    /* Angry eyes */
    ctx.fillStyle = '#ff0044'; ctx.shadowBlur = 8; ctx.shadowColor = '#ff0044';
    ctx.beginPath(); ctx.arc(cx - headR * 0.32, headY - headR * 0.05, headR * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + headR * 0.32, headY - headR * 0.05, headR * 0.16, 0, Math.PI * 2); ctx.fill();

    /* Cap */
    ctx.fillStyle = '#220000'; ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.5, headR * 1.05, headR * 0.42, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - headR * 1.15, headY - headR * 0.62, headR * 2.3, headR * 0.22);

    ctx.restore();
  }

  /* ── Draw PLAYER (compact police bot) ───────── */
  function drawPlayer(lane, t, flash) {
    var pos = toScreen(lane, t);
    var sc  = pos.sc;
    var x   = pos.x, y = pos.y;

    var bw = Math.min(W * 0.13, 90) * (sc / PT);
    var bh = bw * 1.45;
    var dx = x - bw / 2, dy = y - bh;

    ctx.save();

    if (flash > 0) ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(G.frame * 2.0));

    /* Ground shadow */
    ctx.save();
    ctx.globalAlpha = 0.20 * Math.min(sc * 1.5, 1);
    ctx.fillStyle   = G.shieldOn ? '#00ff9d' : '#00ccff';
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * sc, bw * 0.42, bh * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var img = imgPlayer;
    if (img.complete && img.naturalWidth > 0 && !img._failed) {
      if (G.shieldOn) { ctx.shadowBlur = 30 * sc; ctx.shadowColor = '#00ff9d'; }
      ctx.drawImage(img, dx, dy, bw, bh);
      ctx.shadowBlur = 0;
    } else {
      drawPlayerFallback(x, y, bw, bh, sc);
    }

    ctx.globalAlpha = 1;

    /* Shield bubble */
    if (G.shieldOn) {
      var pulse = 0.5 + 0.5 * Math.sin(G.frame * 0.17);
      ctx.save();
      ctx.globalAlpha = pulse * 0.70;
      ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 2.8 * sc;
      ctx.shadowBlur  = 24 * sc; ctx.shadowColor = '#00ff9d';
      ctx.beginPath();
      ctx.ellipse(x, y - bh * 0.42, bw * 0.60, bh * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPlayerFallback(cx, by, w, h, sc) {
    ctx.save();
    var col = G.shieldOn ? '#00ff9d' : '#00e5ff';

    /* Hover glow */
    ctx.shadowBlur = 22 * sc; ctx.shadowColor = col;

    /* Main body */
    ctx.fillStyle = col;
    rr(cx - w*0.36, by - h*0.76, w*0.72, h*0.62, 8*sc);
    ctx.fill();

    /* Dark cockpit window */
    ctx.fillStyle = 'rgba(0,16,50,0.92)'; ctx.shadowBlur = 0;
    rr(cx - w*0.21, by - h*0.76, w*0.42, h*0.27, 5*sc);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,242,255,0.40)'; ctx.lineWidth = 1*sc; ctx.stroke();

    /* Gun barrel */
    ctx.fillStyle = '#ffffffcc'; ctx.shadowBlur = 9*sc; ctx.shadowColor = '#fff';
    ctx.fillRect(cx - 3*sc, by - h, 6*sc, h * 0.26);

    /* Headlights */
    ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 14*sc;
    ctx.beginPath(); ctx.arc(cx - w*0.28, by - h*0.62, 5*sc, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + w*0.28, by - h*0.62, 5*sc, 0, Math.PI*2); ctx.fill();

    /* Underglow */
    ctx.fillStyle = 'rgba(0,200,255,0.18)'; ctx.shadowBlur = 20*sc; ctx.shadowColor = col;
    ctx.beginPath(); ctx.ellipse(cx, by - h*0.03, w*0.43, h*0.055, 0, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }

  /* ── Draw bullets (travel from player → thief) ─ */
  function drawBullets() {
    ctx.save();
    for (var i = 0; i < G.bullets.length; i++) {
      var b  = G.bullets[i];
      var p  = toScreen(b.lane, b.t);
      var sc = p.sc;
      var bw = 8 * sc, bh = 24 * sc;

      /* Trail */
      for (var ti = 0; ti < b.trail.length; ti++) {
        var tp  = toScreen(b.lane, b.trail[ti]);
        var tsc = tp.sc;
        ctx.globalAlpha = (ti / b.trail.length) * 0.30;
        ctx.fillStyle   = '#00f2ff';
        ctx.fillRect(tp.x - 4 * tsc, tp.y - 18 * tsc, 8 * tsc, 18 * tsc);
      }
      ctx.globalAlpha = 1;

      /* Bullet body */
      ctx.shadowBlur  = 18 * sc; ctx.shadowColor = '#00f2ff';
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(p.x - bw/2, p.y - bh, bw, bh);

      /* Tip */
      ctx.fillStyle = '#00f2ff';
      ctx.beginPath(); ctx.arc(p.x, p.y - bh, bw/2, 0, Math.PI*2); ctx.fill();

      /* Muzzle flash */
      if (b.age < 6) {
        var mf = (6 - b.age) / 6;
        ctx.globalAlpha = mf * 0.85;
        ctx.fillStyle   = '#ffe600'; ctx.shadowBlur = 28*sc; ctx.shadowColor = '#ffe600';
        ctx.beginPath(); ctx.arc(p.x, p.y - bh/2, 13*sc*mf, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* ── Draw obstacle ───────────────────────────── */
  function drawObs(o) {
    var p  = toScreen(o.lane, o.t);
    var sc = p.sc;
    var ow = 62 * sc, oh = 54 * sc;

    ctx.save();
    ctx.translate(p.x, p.y - oh * 0.5);
    ctx.rotate(o.spin);

    ctx.fillStyle = '#aa00cc'; ctx.shadowBlur = 28*sc; ctx.shadowColor = '#ff00ea';
    rr(-ow/2, -oh/2, ow, oh, 7*sc); ctx.fill();

    ctx.fillStyle = '#ff55ff'; ctx.shadowBlur = 0;
    rr(-ow*0.27, -oh*0.27, ow*0.54, oh*0.54, 4*sc); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font      = 'bold ' + Math.max(10, Math.round(20*sc)) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  }

  /* ── Draw powerup ────────────────────────────── */
  var PU_COL  = { shield: '#00ff9d', rapid: '#ffe600', life: '#ff4466' };
  var PU_ICON = { shield: 'S', rapid: 'R', life: '♥' };

  function drawPup(pu) {
    var p   = toScreen(pu.lane, pu.t);
    var sc  = p.sc, ps = 50 * sc;
    var col = PU_COL[pu.type];
    var pulse = 0.60 + 0.40 * Math.abs(Math.sin(G.frame * 0.11));

    ctx.save();
    ctx.translate(p.x, p.y - ps * 0.5);
    ctx.rotate(pu.spin);

    ctx.globalAlpha = pulse;
    ctx.strokeStyle = col; ctx.lineWidth = 2.8 * sc;
    ctx.shadowBlur  = 22 * sc; ctx.shadowColor = col;
    ctx.beginPath(); ctx.arc(0, 0, ps * 0.5, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle   = col + '22'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0, 0, ps * 0.36, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur  = 0; ctx.fillStyle = col;
    ctx.font        = 'bold ' + Math.max(8, Math.round(16*sc)) + 'px Orbitron, monospace';
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(PU_ICON[pu.type], 0, 1);
    ctx.restore();
  }

  /* ── HUD update ──────────────────────────────── */
  function hudUpdate() {
    document.getElementById('hScore').textContent = Math.floor(G.score);
    document.getElementById('hLevel').textContent = G.level;
    var livesTxt = '';
    for (var i = 0; i < 3; i++) livesTxt += (i < G.lives ? '❤' : '🖤');
    document.getElementById('hLives').textContent = livesTxt;

    var sb = document.getElementById('shieldBar');
    if (G.shieldOn) {
      sb.classList.remove('hidden');
      document.getElementById('shieldFill').style.width = (G.shieldT / 330 * 100) + '%';
    } else { sb.classList.add('hidden'); }

    var rb = document.getElementById('rapidBar');
    if (G.rapidOn) {
      rb.classList.remove('hidden');
      document.getElementById('rapidFill').style.width = (G.rapidT / 270 * 100) + '%';
    } else { rb.classList.add('hidden'); }
  }

  /* ── Event banner ────────────────────────────── */
  var evtTimer = null;
  function showEvt(msg) {
    var el = document.getElementById('evtText');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(evtTimer);
    evtTimer = setTimeout(function () { el.classList.remove('show'); }, 1400);
  }

  /* ── Hit detection helper ────────────────────── */
  function depthHit(a, b, tol) { return Math.abs(a - b) < tol; }

  function spawnPos(lane, t) {
    var p = toScreen(lane, t);
    return { x: p.x, y: p.y - 55 * p.sc };
  }

  /* ══════════════════════════════════════════════
     GAME TICK
  ══════════════════════════════════════════════ */
  function tick() {
    G.frame++;
    G.dist++;
    G.score += 0.18 + (G.level - 1) * 0.04;
    G.level  = 1 + Math.floor(G.dist / 600);

    /* Timers */
    if (G.shieldT > 0) G.shieldT--; else G.shieldOn = false;
    if (G.rapidT  > 0) G.rapidT--;  else G.rapidOn  = false;
    if (G.comboCD > 0) G.comboCD--; else G.combo     = 0;
    if (G.flashT  > 0) G.flashT--;
    if (G.pFlash  > 0) G.pFlash--;
    if (G.tFlash  > 0) G.tFlash--;

    /* Auto-shoot when aligned with thief */
    if (G.shootCD > 0) G.shootCD--;
    if (G.lane === G.tLane && G.shootCD <= 0) {
      G.bullets.push({ lane: G.lane, t: PT - 0.06, trail: [], age: 0 });
      SFX.shoot();
      G.shootCD = G.rapidOn ? 12 : 26;
    }

    /* Thief AI — change lanes */
    G.tCD--;
    if (G.tCD <= 0) {
      G.tLane = Math.floor(Math.random() * NLANES);
      G.tCD   = Math.max(18, 78 - G.level * 8);
    }

    /* Bullets move toward horizon (t decreases) */
    var bSpd = 0.028 + G.level * 0.002;
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.trail.push(b.t);
      if (b.trail.length > 6) b.trail.shift();
      b.t -= bSpd;
      b.age++;

      /* Hit thief — tighter tolerance (0.07) */
      if (b.lane === G.tLane && depthHit(b.t, TT, 0.07)) {
        G.combo++;
        G.comboCD = 110;
        var pts = 10 + (G.combo > 1 ? G.combo * 8 : 0);
        G.score += pts;
        G.tFlash  = 18;
        var sp = spawnPos(G.tLane, TT);
        burst(sp.x, sp.y, '#ff0044', 26);
        G.flashT  = 8; G.flashCol = 'rgba(255,0,80,0.10)';
        SFX.hit();
        if (G.combo > 1) { SFX.combo(); showEvt('COMBO ×' + G.combo + '  +' + pts + ' pts'); }
        else showEvt('+10');
        G.bullets.splice(i, 1);
        hudUpdate();
        continue;
      }
      /* Remove if went past horizon */
      if (b.t < TT - 0.12) G.bullets.splice(i, 1);
    }

    /* Obstacles: spawn at horizon, move to player */
    var obsRate = Math.max(38, 92 - G.level * 8);
    if (G.frame % obsRate === 0) {
      var ol;
      do { ol = Math.floor(Math.random() * NLANES); } while (Math.random() < 0.28 && ol === G.lane);
      G.obs.push({ lane: ol, t: 0.04, spin: 0 });
    }
    var oSpd = 0.0080 + G.level * 0.0008;
    for (var oi = G.obs.length - 1; oi >= 0; oi--) {
      var o = G.obs[oi];
      o.t   += oSpd;
      o.spin += 0.034;
      if (o.t > 1.05) { G.obs.splice(oi, 1); continue; }
      if (o.lane === G.lane && depthHit(o.t, PT, 0.07)) {
        var sp2 = spawnPos(G.lane, PT);
        if (G.shieldOn) {
          G.shieldOn = false; G.shieldT = 0;
          burst(sp2.x, sp2.y, '#00ff9d', 22);
          SFX.pu(); showEvt('SHIELD BLOCKED IT!');
        } else {
          G.lives--;
          G.pFlash = 26;
          G.flashT = 22; G.flashCol = 'rgba(255,0,0,0.24)';
          burst(sp2.x, sp2.y, '#ff3333', 32);
          SFX.crash();
          if (G.lives <= 0) { endGame(); return; }
          showEvt('OUCH!  ' + '❤'.repeat(G.lives));
        }
        G.obs.splice(oi, 1);
        hudUpdate();
      }
    }

    /* Powerups: spawn at horizon, move to player */
    if (G.frame % 230 === 0) {
      var types = ['shield', 'rapid', 'life'];
      G.pups.push({
        lane: Math.floor(Math.random() * NLANES),
        t: 0.04,
        type: types[Math.floor(Math.random() * 3)],
        spin: 0
      });
    }
    var puSpd = 0.0048;
    for (var pi = G.pups.length - 1; pi >= 0; pi--) {
      var pu = G.pups[pi];
      pu.t   += puSpd;
      pu.spin += 0.07;
      if (pu.t > 1.05) { G.pups.splice(pi, 1); continue; }
      if (pu.lane === G.lane && depthHit(pu.t, PT, 0.09)) {
        SFX.pu();
        var sp3 = spawnPos(G.lane, PT);
        burst(sp3.x, sp3.y, PU_COL[pu.type], 18);
        if (pu.type === 'shield') { G.shieldOn = true;  G.shieldT = 330; showEvt('⚡ SHIELD ON!'); }
        if (pu.type === 'rapid')  { G.rapidOn  = true;  G.rapidT  = 270; showEvt('🔥 RAPID FIRE!'); }
        if (pu.type === 'life' && G.lives < 3) { G.lives++; hudUpdate(); showEvt('❤ EXTRA LIFE!'); }
        G.pups.splice(pi, 1);
        hudUpdate();
      }
    }

    updateParticles();
  }

  /* ── Render ──────────────────────────────────── */
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawRoad();

    /* Screen flash */
    if (G.flashT > 0) {
      ctx.fillStyle = G.flashCol;
      ctx.fillRect(0, 0, W, H);
    }

    /* Sort obs + pups far to near for correct depth order */
    var allObjs = [];
    for (var i = 0; i < G.obs.length;  i++) allObjs.push({ t: G.obs[i].t,  d: G.obs[i],  tp: 'o' });
    for (var j = 0; j < G.pups.length; j++) allObjs.push({ t: G.pups[j].t, d: G.pups[j], tp: 'p' });
    allObjs.sort(function (a, b) { return a.t - b.t; });
    for (var k = 0; k < allObjs.length; k++) {
      if (allObjs[k].tp === 'o') drawObs(allObjs[k].d);
      else drawPup(allObjs[k].d);
    }

    /* Draw order: thief behind bullets, player in front */
    drawThief(G.tLane, TT, G.tFlash);
    drawBullets();
    drawParticles();
    drawPlayer(G.lane, PT, G.pFlash);

    /* Combo overlay */
    if (G.combo > 1 && G.comboCD > 0) {
      var ca = Math.min(1, G.comboCD / 45);
      var fs = Math.max(18, Math.min(30, Math.round(W * 0.046)));
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.fillStyle   = '#ffe600'; ctx.shadowBlur = 20; ctx.shadowColor = '#ffe600';
      ctx.font        = '900 ' + fs + 'px Orbitron, monospace';
      ctx.textAlign   = 'center';
      ctx.fillText('×' + G.combo + ' COMBO', W * 0.5, H * 0.47);
      ctx.restore();
    }
  }

  /* ── Game loop ───────────────────────────────── */
  function loop() {
    if (!G.on) return;
    tick();
    render();
    G.raf = requestAnimationFrame(loop);
  }

  /* ── End game ────────────────────────────────── */
  function endGame() {
    G.on = false;
    cancelAnimationFrame(G.raf);
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('bars').classList.add('hidden');
    document.getElementById('ctrl').classList.add('hidden');
    document.getElementById('goTag').textContent   = 'MISSION FAILED';
    document.getElementById('goTitle').textContent = 'ELIMINATED';
    document.getElementById('goInfo').innerHTML    =
      'SCORE &nbsp; ' + Math.floor(G.score) + '<br>' +
      'LEVEL &nbsp; ' + G.level + '<br>' +
      'DIST &nbsp; '  + G.dist  + 'm';
    document.getElementById('goScreen').classList.remove('hidden');
  }

  /* ── Controls ────────────────────────────────── */
  function mvL() { if (G.on && G.lane > 0)           G.lane--; }
  function mvR() { if (G.on && G.lane < NLANES - 1)  G.lane++; }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); mvL(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); mvR(); }
  });

  function bindBtn(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
    el.addEventListener('mousedown', fn);
  }
  bindBtn('cLeft',  mvL);
  bindBtn('cRight', mvR);

  /* Swipe support */
  var swipeX = null;
  window.addEventListener('touchstart', function (e) { swipeX = e.touches[0].clientX; }, { passive: true });
  window.addEventListener('touchend', function (e) {
    if (swipeX === null) return;
    var dx = e.changedTouches[0].clientX - swipeX;
    if (Math.abs(dx) > 40) { dx < 0 ? mvL() : mvR(); }
    swipeX = null;
  });

  /* ── Start ───────────────────────────────────── */
  document.getElementById('startBtn').addEventListener('click', function () {
    try { getAC().resume(); } catch (e) {}
    resetGame();
    hudUpdate();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('goScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('bars').classList.remove('hidden');
    document.getElementById('ctrl').classList.remove('hidden');
    G.on = true;
    loop();
  });

})();
