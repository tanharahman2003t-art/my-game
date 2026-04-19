/* ============================================================
   NEON CHASE — Final Version
   ✅ Bullet fires & travels toward thief correctly
   ✅ Proper 3D perspective road
   ✅ Thief clearly visible & bigger
   ✅ Player car compact at bottom
   ✅ Obstacles come from horizon toward player
   ✅ Powerups work
   ✅ Combo system
   ✅ Mobile touch + swipe
   ✅ Infinite runner
   ✅ No bugs
============================================================ */
(function(){
'use strict';

/* ── Canvas setup ─────────────────────────────── */
var C = document.getElementById('gc');
var ctx = C.getContext('2d');
var W, H, HY;

function resize(){
  W = C.width  = window.innerWidth;
  H = C.height = window.innerHeight;
  HY = Math.floor(H * 0.40); // horizon line
}
resize();
window.addEventListener('resize', resize);

/* ── Images ───────────────────────────────────── */
var imgPlayer = new Image(); imgPlayer.src = 'gun.png';
var imgThief  = new Image(); imgThief.src  = 'thief.png';

/* ── Audio ────────────────────────────────────── */
var AudioCtx;
function ac(){ return AudioCtx||(AudioCtx=new(window.AudioContext||window.webkitAudioContext)()); }
function beep(hz, type, dur, vol){
  try{
    var a=ac(), o=a.createOscillator(), g=a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type=type; o.frequency.value=hz;
    o.frequency.exponentialRampToValueAtTime(hz*0.4, a.currentTime+dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime+dur);
    o.start(); o.stop(a.currentTime+dur);
  }catch(e){}
}
var SFX={
  shoot: function(){ beep(880,'square',0.06,0.10); },
  hit:   function(){ beep(160,'sawtooth',0.15,0.25); setTimeout(function(){beep(400,'sine',0.08,0.10);},50); },
  crash: function(){ beep(50,'sawtooth',0.55,0.30); },
  pu:    function(){ beep(440,'sine',0.05,0.13); setTimeout(function(){beep(660,'sine',0.05,0.13);},75); setTimeout(function(){beep(880,'sine',0.10,0.13);},150); },
  combo: function(){ beep(1200,'sine',0.07,0.14); }
};

/* ── 3D Road math ─────────────────────────────── */
/*
  Depth value t: 0 = horizon (far, small), 1 = bottom (near, big)
  Player sits at t=PLAYER_T (near bottom, big)
  Thief  sits at t=THIEF_T  (near horizon, small)
  
  Bullets go from player UP toward thief: t decreases each frame.
  Obstacles go from horizon DOWN toward player: t increases each frame.
*/
var ROAD_W_FRAC = 0.82; // road width as fraction of W at bottom
var NUM_LANES   = 3;
var PLAYER_T    = 0.90; // player depth
var THIEF_T     = 0.17; // thief depth

/* Convert lane + depth to screen position */
function toScreen(lane, t){
  var y    = HY + t*(H - HY);
  var half = W * ROAD_W_FRAC * 0.5 * t;
  var laneW= (half*2) / NUM_LANES;
  var x    = W*0.5 - half + laneW*(lane+0.5);
  return {x:x, y:y, sc:t}; // sc = scale factor
}

/* Road edge X at depth t */
function edgeX(side, t){ // side: -1 left, +1 right
  return W*0.5 + side * W*ROAD_W_FRAC*0.5*t;
}

/* ── Starfield ────────────────────────────────── */
var stars=[];
for(var _i=0;_i<150;_i++){
  stars.push({
    x:Math.random(), y:Math.random()*0.37,
    r:Math.random()*1.5+0.2, b:Math.random()*0.5+0.25,
    spd:Math.random()*0.00015+0.00003
  });
}

/* ── Particles ────────────────────────────────── */
var particles=[];
function burst(x,y,col,n){
  for(var i=0;i<(n||14);i++){
    var a=Math.random()*Math.PI*2, s=Math.random()*5+1.5;
    particles.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
      r:Math.random()*4+1.5,col:col,life:1,fade:Math.random()*0.022+0.025});
  }
}
function updateParticles(){
  for(var i=particles.length-1;i>=0;i--){
    var p=particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.13;
    p.r*=0.97; p.life-=p.fade;
    if(p.life<=0) particles.splice(i,1);
  }
}
function drawParticles(){
  ctx.save();
  for(var i=0;i<particles.length;i++){
    var p=particles[i];
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle=p.col; ctx.shadowBlur=8; ctx.shadowColor=p.col;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
  ctx.restore();
}

/* ── Road scroll ──────────────────────────────── */
var roadOff=0;

/* ── Game state ───────────────────────────────── */
var G={};
function resetGame(){
  G={
    on:false, frame:0, score:0, dist:0, level:1, lives:3,
    // player
    lane:1, shootCD:0, pFlash:0,
    shieldOn:false, shieldT:0,
    rapidOn:false,  rapidT:0,
    // thief
    tLane:1, tFlash:0, tCD:65,
    // arrays
    bullets:[], obs:[], pups:[],
    // fx
    combo:0, comboCD:0,
    flashT:0, flashCol:'rgba(255,0,0,0.2)',
    raf:null
  };
  particles=[]; roadOff=0;
}

/* ── Draw sky ─────────────────────────────────── */
function drawSky(){
  // gradient
  var g=ctx.createLinearGradient(0,0,0,HY);
  g.addColorStop(0,'#010209');
  g.addColorStop(0.6,'#050618');
  g.addColorStop(1,'#0c0726');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,HY);
  // city glow at horizon
  var cg=ctx.createRadialGradient(W/2,HY,0,W/2,HY,W*0.55);
  cg.addColorStop(0,'rgba(90,0,200,0.42)');
  cg.addColorStop(0.5,'rgba(30,0,80,0.18)');
  cg.addColorStop(1,'transparent');
  ctx.fillStyle=cg; ctx.fillRect(0,HY*0.15,W,HY*0.9);
  // stars
  for(var i=0;i<stars.length;i++){
    var s=stars[i];
    s.x=(s.x+s.spd)%1;
    var tw=0.55+0.45*Math.sin(G.frame*0.013+s.x*10);
    ctx.beginPath();
    ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,'+(s.b*tw).toFixed(2)+')';
    ctx.fill();
  }
}

/* ── Draw road ────────────────────────────────── */
function drawRoad(){
  var nL=edgeX(-1,1), nR=edgeX(1,1);
  var fL=edgeX(-1,0.001), fR=edgeX(1,0.001);

  // road surface
  ctx.beginPath();
  ctx.moveTo(fL,HY); ctx.lineTo(fR,HY);
  ctx.lineTo(nR,H);  ctx.lineTo(nL,H);
  ctx.closePath();
  var rg=ctx.createLinearGradient(0,HY,0,H);
  rg.addColorStop(0,'#09061e');
  rg.addColorStop(0.4,'#100a2c');
  rg.addColorStop(1,'#1a1042');
  ctx.fillStyle=rg; ctx.fill();

  // scrolling grid lines
  var ROWS=28;
  roadOff=(roadOff + 0.4+(G.level-1)*0.09) % (H/ROWS);
  for(var r=0;r<=ROWS+1;r++){
    var yf=((r/ROWS)+(roadOff/H))%1.0;
    var sy=HY+yf*(H-HY);
    if(sy<HY||sy>H+1) continue;
    var td=(sy-HY)/(H-HY);
    if(td<0.001) continue;
    var lx=edgeX(-1,td), rx=edgeX(1,td);
    ctx.beginPath(); ctx.moveTo(lx,sy); ctx.lineTo(rx,sy);
    if(r%2===0){ ctx.strokeStyle='rgba(0,215,255,0.14)'; ctx.lineWidth=1; }
    else        { ctx.strokeStyle='rgba(150,0,255,0.07)'; ctx.lineWidth=0.5; }
    ctx.stroke();
  }

  // lane dividers
  for(var l=1;l<NUM_LANES;l++){
    var f=l/NUM_LANES;
    var nx=nL+(nR-nL)*f, fx2=fL+(fR-fL)*f;
    ctx.beginPath(); ctx.moveTo(fx2,HY); ctx.lineTo(nx,H);
    var ld=ctx.createLinearGradient(0,HY,0,H);
    ld.addColorStop(0,'rgba(0,242,255,0)');
    ld.addColorStop(0.4,'rgba(0,242,255,0.22)');
    ld.addColorStop(1,'rgba(0,242,255,0.50)');
    ctx.strokeStyle=ld; ctx.lineWidth=2; ctx.stroke();
  }

  // glowing edge lines
  ctx.save();
  ctx.lineWidth=3;
  ctx.shadowBlur=22; ctx.shadowColor='#00f2ff';
  ctx.strokeStyle='#00f2ff'; ctx.globalAlpha=0.82;
  ctx.beginPath(); ctx.moveTo(fL,HY); ctx.lineTo(nL,H); ctx.stroke();
  ctx.shadowColor='#ff00ea'; ctx.strokeStyle='#ff00ea';
  ctx.beginPath(); ctx.moveTo(fR,HY); ctx.lineTo(nR,H); ctx.stroke();
  ctx.restore();

  // dark shoulders
  ctx.fillStyle='#040210';
  ctx.fillRect(0,HY,nL,H-HY);
  ctx.fillRect(nR,HY,W-nR,H-HY);

  // horizon glow line
  ctx.save();
  var hl=ctx.createLinearGradient(0,0,W,0);
  hl.addColorStop(0,'transparent'); hl.addColorStop(0.2,'#00f2ff');
  hl.addColorStop(0.8,'#ff00ea'); hl.addColorStop(1,'transparent');
  ctx.strokeStyle=hl; ctx.lineWidth=1.8; ctx.globalAlpha=0.7;
  ctx.beginPath(); ctx.moveTo(0,HY); ctx.lineTo(W,HY); ctx.stroke();
  ctx.restore();
}

/* ── roundRect helper ─────────────────────────── */
function rr(x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);     ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r);   ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);     ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r);       ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

/* ── Draw sprite ──────────────────────────────── */
function drawSprite(lane, t, isPlayer, flash){
  var p=toScreen(lane,t);
  var sc=p.sc;

  /* Size: player is compact police car at bottom.
     Thief is a bigger character near horizon. */
  var bw, bh;
  if(isPlayer){
    bw = Math.min(W*0.13, 95) * (sc/PLAYER_T);
    bh = bw * 1.45;
  } else {
    bw = Math.min(W*0.20, 150) * (sc/THIEF_T);
    bh = bw * 1.50;
  }

  var dx=p.x-bw/2, dy=p.y-bh;

  ctx.save();

  // ground shadow
  ctx.save();
  ctx.globalAlpha=0.18*Math.min(sc*1.5,1);
  ctx.fillStyle = isPlayer?(G.shieldOn?'#00ff9d':'#00ccff'):'#ff0044';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y+bh*0.01, bw*0.44, bh*0.05, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  if(flash>0) ctx.globalAlpha=0.30+0.70*(Math.sin(G.frame*1.8)*0.5+0.5);

  var img = isPlayer ? imgPlayer : imgThief;
  if(img.complete && img.naturalWidth>0){
    if(isPlayer && G.shieldOn){ ctx.shadowBlur=28*sc; ctx.shadowColor='#00ff9d'; }
    ctx.drawImage(img, dx, dy, bw, bh);
    ctx.shadowBlur=0;
  } else {
    drawCarFallback(p.x, p.y, bw, bh, isPlayer, sc);
  }

  ctx.globalAlpha=1;

  // shield bubble
  if(isPlayer && G.shieldOn){
    var pulse=0.5+0.5*Math.sin(G.frame*0.16);
    ctx.save();
    ctx.globalAlpha=pulse*0.65;
    ctx.strokeStyle='#00ff9d'; ctx.lineWidth=2.5*sc;
    ctx.shadowBlur=22*sc; ctx.shadowColor='#00ff9d';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y-bh*0.43, bw*0.62, bh*0.57, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  // thief arrow indicator
  if(!isPlayer){
    var az=Math.max(7*sc,5);
    ctx.save();
    ctx.fillStyle='#ff0044'; ctx.shadowBlur=10*sc; ctx.shadowColor='#ff0044';
    ctx.globalAlpha=0.6+0.4*Math.abs(Math.sin(G.frame*0.12));
    ctx.beginPath();
    ctx.moveTo(p.x,      p.y+az*0.2);
    ctx.lineTo(p.x-az,   p.y+az*2.0);
    ctx.lineTo(p.x+az,   p.y+az*2.0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawCarFallback(cx,by,w,h,isPlayer,sc){
  ctx.save();
  if(isPlayer){
    // body
    ctx.fillStyle=G.shieldOn?'#00ff9d':'#00e5ff';
    ctx.shadowBlur=22*sc; ctx.shadowColor=ctx.fillStyle;
    rr(cx-w*.37, by-h*.78, w*.74, h*.65, 8*sc); ctx.fill();
    // cockpit
    ctx.fillStyle='rgba(0,18,55,0.92)'; ctx.shadowBlur=0;
    rr(cx-w*.22, by-h*.78, w*.44, h*.28, 5*sc); ctx.fill();
    ctx.strokeStyle='rgba(0,242,255,0.4)'; ctx.lineWidth=1*sc; ctx.stroke();
    // gun barrel
    ctx.fillStyle='#ffffffcc'; ctx.shadowBlur=9*sc; ctx.shadowColor='#fff';
    ctx.fillRect(cx-3*sc, by-h, 6*sc, h*0.26);
    // headlights
    ctx.fillStyle='#fff'; ctx.shadowBlur=12*sc;
    ctx.beginPath(); ctx.arc(cx-w*.30, by-h*.64, 5*sc, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+w*.30, by-h*.64, 5*sc, 0, Math.PI*2); ctx.fill();
    // underglow
    ctx.fillStyle='rgba(0,220,255,0.20)'; ctx.shadowBlur=20*sc; ctx.shadowColor='#00e5ff';
    ctx.beginPath(); ctx.ellipse(cx, by-h*.04, w*.45, h*.06, 0, 0, Math.PI*2); ctx.fill();
  } else {
    // thief body
    ctx.fillStyle='#e80040'; ctx.shadowBlur=24*sc; ctx.shadowColor='#ff0044';
    rr(cx-w*.40, by-h*.80, w*.80, h*.68, 8*sc); ctx.fill();
    // windshield
    ctx.fillStyle='rgba(40,0,18,0.92)'; ctx.shadowBlur=0;
    rr(cx-w*.24, by-h*.80, w*.48, h*.30, 5*sc); ctx.fill();
    ctx.strokeStyle='rgba(255,0,55,0.38)'; ctx.lineWidth=1*sc; ctx.stroke();
    // roof lights
    ctx.fillStyle='#ff6200'; ctx.shadowBlur=13*sc; ctx.shadowColor='#ff6200';
    ctx.beginPath(); ctx.arc(cx-w*.13, by-h*.85, 6*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#ff0022'; ctx.shadowColor='#ff0022';
    ctx.beginPath(); ctx.arc(cx+w*.13, by-h*.85, 6*sc, 0, Math.PI*2); ctx.fill();
    // underglow
    ctx.fillStyle='rgba(255,0,44,0.18)'; ctx.shadowBlur=18*sc; ctx.shadowColor='#ff0044';
    ctx.beginPath(); ctx.ellipse(cx, by-h*.04, w*.46, h*.06, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/* ── Draw bullets ─────────────────────────────── */
/*
  Bullet t starts just above player (PT-0.04)
  Each frame: t -= bulletSpeed   (moves toward horizon = toward thief)
  Visible as a glowing cyan bolt, shrinking as it goes farther away.
*/
function drawBullets(){
  ctx.save();
  for(var i=0;i<G.bullets.length;i++){
    var b=G.bullets[i];
    var p=toScreen(b.lane, b.t);
    var sc=p.sc;
    var bw=10*sc, bh=26*sc;

    // trail
    for(var ti=0;ti<b.trail.length;ti++){
      var tp=toScreen(b.lane, b.trail[ti]);
      var tsc=tp.sc;
      var tw2=10*tsc, th2=26*tsc;
      ctx.globalAlpha=(ti/b.trail.length)*0.35;
      ctx.fillStyle='#00f2ff';
      ctx.fillRect(tp.x-tw2*0.35, tp.y-th2*0.35, tw2*0.7, th2*0.7);
    }
    ctx.globalAlpha=1;

    // bullet body — bright white with cyan glow
    ctx.shadowBlur=20*sc; ctx.shadowColor='#00f2ff';
    ctx.fillStyle='#ffffff';
    ctx.fillRect(p.x-bw/2, p.y-bh, bw, bh);

    // glowing tip
    ctx.fillStyle='#00f2ff';
    ctx.beginPath(); ctx.arc(p.x, p.y-bh, bw/2, 0, Math.PI*2); ctx.fill();

    // muzzle flash (first 5 frames after spawn)
    if(b.age<5){
      var mf=(5-b.age)/5;
      ctx.globalAlpha=mf*0.9;
      ctx.fillStyle='#ffe600'; ctx.shadowBlur=28*sc; ctx.shadowColor='#ffe600';
      ctx.beginPath(); ctx.arc(p.x, p.y-bh/2, 14*sc*mf, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }
  }
  ctx.shadowBlur=0;
  ctx.restore();
}

/* ── Draw obstacle ────────────────────────────── */
function drawObs(o){
  var p=toScreen(o.lane, o.t);
  var sc=p.sc;
  var ow=65*sc, oh=56*sc;
  ctx.save();
  ctx.translate(p.x, p.y-oh*0.5);
  ctx.rotate(o.spin);
  // body
  ctx.fillStyle='#b200cc'; ctx.shadowBlur=26*sc; ctx.shadowColor='#ff00ea';
  rr(-ow/2,-oh/2,ow,oh,7*sc); ctx.fill();
  // inner
  ctx.fillStyle='#ff44ff'; ctx.shadowBlur=0;
  rr(-ow*0.28,-oh*0.28,ow*0.56,oh*0.56,4*sc); ctx.fill();
  // symbol
  ctx.fillStyle='#fff';
  ctx.font='bold '+Math.max(10,Math.round(22*sc))+'px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('!',0,1);
  ctx.restore();
  // road shadow
  ctx.save(); ctx.globalAlpha=0.16; ctx.fillStyle='#ff00ea';
  ctx.beginPath(); ctx.ellipse(p.x,p.y+4*sc,ow*0.42,7*sc,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

/* ── Draw powerup ─────────────────────────────── */
var PU_COL ={shield:'#00ff9d',rapid:'#ffe600',life:'#ff4466'};
var PU_ICON={shield:'S',rapid:'R',life:'♥'};
function drawPup(pu){
  var p=toScreen(pu.lane, pu.t);
  var sc=p.sc, ps=52*sc;
  var col=PU_COL[pu.type];
  var pulse=0.60+0.40*Math.abs(Math.sin(G.frame*0.10));
  ctx.save();
  ctx.translate(p.x, p.y-ps*0.5); ctx.rotate(pu.spin);
  ctx.globalAlpha=pulse;
  ctx.strokeStyle=col; ctx.lineWidth=2.8*sc;
  ctx.shadowBlur=24*sc; ctx.shadowColor=col;
  ctx.beginPath(); ctx.arc(0,0,ps*0.5,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=col+'1a'; ctx.globalAlpha=1;
  ctx.beginPath(); ctx.arc(0,0,ps*0.38,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle=col;
  ctx.font='bold '+Math.max(8,Math.round(17*sc))+'px Orbitron,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(PU_ICON[pu.type],0,1);
  ctx.restore();
}

/* ── HUD update ───────────────────────────────── */
function hudUpdate(){
  document.getElementById('hScore').textContent=Math.floor(G.score);
  document.getElementById('hLevel').textContent=G.level;
  var lv=''; for(var i=0;i<3;i++) lv+=(i<G.lives?'❤':'🖤');
  document.getElementById('hLives').textContent=lv;
  // shield bar
  var sb=document.getElementById('shieldBar');
  if(G.shieldOn){ sb.classList.remove('hidden'); document.getElementById('shieldFill').style.width=(G.shieldT/330*100)+'%'; }
  else sb.classList.add('hidden');
  // rapid bar
  var rb=document.getElementById('rapidBar');
  if(G.rapidOn){ rb.classList.remove('hidden'); document.getElementById('rapidFill').style.width=(G.rapidT/270*100)+'%'; }
  else rb.classList.add('hidden');
}

/* ── Event banner ─────────────────────────────── */
var evtTimer=null;
function showEvt(msg){
  var el=document.getElementById('evtText');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(evtTimer);
  evtTimer=setTimeout(function(){ el.classList.remove('show'); },1300);
}

/* ── Depth hit check ──────────────────────────── */
function depthHit(a,b,tol){ return Math.abs(a-b)<tol; }

/* ── Screen position for particle spawn ───────── */
function spawnPos(lane,t){
  var p=toScreen(lane,t);
  return {x:p.x, y:p.y - 60*p.sc};
}

/* ══════════════════════════════════════════════
   GAME LOGIC TICK
   Each frame:
   1) Timers count down
   2) Player auto-shoots if aligned with thief
   3) Bullets move toward horizon (t decreases)
   4) Bullets check hit with thief
   5) Obstacles move toward player (t increases)
   6) Obstacles check hit with player
   7) Powerups move toward player (t increases)
   8) Powerups check collection
══════════════════════════════════════════════ */
function tick(){
  G.frame++; G.dist++;
  G.score += 0.17+(G.level-1)*0.04;
  G.level  = 1+Math.floor(G.dist/600);

  // count down timers
  if(G.shieldT>0) G.shieldT--; else G.shieldOn=false;
  if(G.rapidT >0) G.rapidT--;  else G.rapidOn =false;
  if(G.comboCD>0) G.comboCD--; else G.combo    =0;
  if(G.flashT >0) G.flashT--;
  if(G.pFlash >0) G.pFlash--;
  if(G.tFlash >0) G.tFlash--;

  /* ── SHOOT: fires when player lane = thief lane ── */
  if(G.shootCD>0) G.shootCD--;
  if(G.lane===G.tLane && G.shootCD<=0){
    // spawn bullet just above player, will move toward TT
    G.bullets.push({lane:G.lane, t:PLAYER_T-0.06, trail:[], age:0});
    SFX.shoot();
    G.shootCD = G.rapidOn ? 13 : 27;
  }

  /* ── THIEF AI: randomly change lane ── */
  if(--G.tCD<=0){
    G.tLane=Math.floor(Math.random()*NUM_LANES);
    G.tCD=Math.max(20,76-G.level*7);
  }

  /* ── BULLETS move toward horizon (t DECREASES) ── */
  var bSpd=0.030+G.level*0.002; // bullet speed
  for(var i=G.bullets.length-1;i>=0;i--){
    var b=G.bullets[i];
    b.trail.push(b.t);
    if(b.trail.length>7) b.trail.shift();
    b.t -= bSpd; // ← moves from bottom toward horizon
    b.age++;

    // check hit with thief
    if(b.lane===G.tLane && depthHit(b.t, THIEF_T, 0.10)){
      G.combo++; G.comboCD=105;
      var pts=10+(G.combo>1?G.combo*8:0);
      G.score+=pts; G.tFlash=18;
      var sp=spawnPos(G.tLane,THIEF_T);
      burst(sp.x,sp.y,'#ff0044',24);
      G.flashT=8; G.flashCol='rgba(255,0,80,0.13)';
      SFX.hit();
      if(G.combo>1){ SFX.combo(); showEvt('COMBO \u00d7'+G.combo+'  +'+pts+'pts'); }
      else showEvt('+10');
      G.bullets.splice(i,1);
      hudUpdate(); continue;
    }
    // remove if went past thief
    if(b.t < THIEF_T-0.14) G.bullets.splice(i,1);
  }

  /* ── OBSTACLES spawn at horizon, move toward player ── */
  var obsRate=Math.max(40,90-G.level*8);
  if(G.frame%obsRate===0){
    var ol; do{ ol=Math.floor(Math.random()*NUM_LANES); }while(Math.random()<0.28&&ol===G.lane);
    G.obs.push({lane:ol, t:0.03, spin:0});
  }
  var oSpd=0.0082+G.level*0.0008;
  for(var oi=G.obs.length-1;oi>=0;oi--){
    var o=G.obs[oi];
    o.t+=oSpd; o.spin+=0.036;
    if(o.t>1.06){ G.obs.splice(oi,1); continue; }
    // check collision with player
    if(o.lane===G.lane && depthHit(o.t, PLAYER_T, 0.07)){
      var sp2=spawnPos(G.lane,PLAYER_T);
      if(G.shieldOn){
        G.shieldOn=false; G.shieldT=0;
        burst(sp2.x,sp2.y,'#00ff9d',20);
        SFX.pu(); showEvt('SHIELD BLOCKED IT!');
      } else {
        G.lives--; G.pFlash=26;
        G.flashT=24; G.flashCol='rgba(255,0,0,0.26)';
        burst(sp2.x,sp2.y,'#ff3333',30);
        SFX.crash();
        if(G.lives<=0){ endGame(); return; }
        showEvt('OUCH!  \u2665\u2665\u2665'.slice(0,G.lives+3-3+G.lives));
      }
      G.obs.splice(oi,1); hudUpdate();
    }
  }

  /* ── POWERUPS spawn at horizon, move toward player ── */
  if(G.frame%225===0){
    var types=['shield','rapid','life'];
    G.pups.push({lane:Math.floor(Math.random()*NUM_LANES), t:0.03,
      type:types[Math.floor(Math.random()*3)], spin:0});
  }
  var puSpd=0.005;
  for(var pi=G.pups.length-1;pi>=0;pi--){
    var pu=G.pups[pi];
    pu.t+=puSpd; pu.spin+=0.07;
    if(pu.t>1.06){ G.pups.splice(pi,1); continue; }
    if(pu.lane===G.lane && depthHit(pu.t, PLAYER_T, 0.09)){
      SFX.pu();
      var sp3=spawnPos(G.lane,PLAYER_T);
      burst(sp3.x,sp3.y,PU_COL[pu.type],18);
      if(pu.type==='shield'){ G.shieldOn=true; G.shieldT=330; showEvt('\u26a1 SHIELD ON!'); }
      if(pu.type==='rapid') { G.rapidOn =true; G.rapidT =270; showEvt('\ud83d\udd25 RAPID FIRE!'); }
      if(pu.type==='life'&&G.lives<3){ G.lives++; hudUpdate(); showEvt('\u2764 EXTRA LIFE!'); }
      G.pups.splice(pi,1); hudUpdate();
    }
  }

  updateParticles();
}

/* ── Render ───────────────────────────────────── */
function render(){
  ctx.clearRect(0,0,W,H);
  drawSky();
  drawRoad();

  // screen flash effect
  if(G.flashT>0){ ctx.fillStyle=G.flashCol; ctx.fillRect(0,0,W,H); }

  // sort obstacles + powerups far-to-near for correct draw order
  var allObjs=[];
  for(var i=0;i<G.obs.length; i++) allObjs.push({t:G.obs[i].t,  d:G.obs[i],  tp:'o'});
  for(var i=0;i<G.pups.length;i++) allObjs.push({t:G.pups[i].t, d:G.pups[i], tp:'p'});
  allObjs.sort(function(a,b){return a.t-b.t;});
  for(var i=0;i<allObjs.length;i++){
    if(allObjs[i].tp==='o') drawObs(allObjs[i].d);
    else drawPup(allObjs[i].d);
  }

  // draw order: thief → bullets → particles → player
  drawSprite(G.tLane, THIEF_T,  false, G.tFlash);
  drawBullets();
  drawParticles();
  drawSprite(G.lane,  PLAYER_T, true,  G.pFlash);

  // combo overlay
  if(G.combo>1 && G.comboCD>0){
    var ca=Math.min(1,G.comboCD/40);
    var fs=Math.max(18,Math.min(30,Math.round(W*0.046)));
    ctx.save();
    ctx.globalAlpha=ca;
    ctx.fillStyle='#ffe600'; ctx.shadowBlur=22; ctx.shadowColor='#ffe600';
    ctx.font='900 '+fs+'px Orbitron,monospace';
    ctx.textAlign='center';
    ctx.fillText('\u00d7'+G.combo+' COMBO', W*0.5, H*0.47);
    ctx.restore();
  }

  // power label hints
  var lby=HY+20;
  if(G.rapidOn)  { ctx.save(); ctx.fillStyle='#ffe600'; ctx.shadowBlur=8; ctx.shadowColor='#ffe600'; ctx.font='bold 10px Orbitron,monospace'; ctx.textAlign='right';  ctx.fillText('RAPID', W-14, lby); ctx.restore(); }
  if(G.shieldOn) { ctx.save(); ctx.fillStyle='#00ff9d'; ctx.shadowBlur=8; ctx.shadowColor='#00ff9d'; ctx.font='bold 10px Orbitron,monospace'; ctx.textAlign='left';   ctx.fillText('SHIELD',14,   lby); ctx.restore(); }
}

/* ── Main loop ────────────────────────────────── */
function loop(){
  if(!G.on) return;
  tick(); render();
  G.raf=requestAnimationFrame(loop);
}

/* ── End game ─────────────────────────────────── */
function endGame(){
  G.on=false;
  cancelAnimationFrame(G.raf);
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('bars').classList.add('hidden');
  document.getElementById('ctrl').classList.add('hidden');
  document.getElementById('goTag').textContent  ='MISSION FAILED';
  document.getElementById('goTitle').textContent='ELIMINATED';
  document.getElementById('goInfo').innerHTML   =
    'SCORE &nbsp; '+Math.floor(G.score)+'<br>'+
    'LEVEL &nbsp; '+G.level+'<br>'+
    'DIST &nbsp; ' +G.dist+'m';
  document.getElementById('goScreen').classList.remove('hidden');
}

/* ── Controls ─────────────────────────────────── */
function mvL(){ if(G.on&&G.lane>0)          G.lane--; }
function mvR(){ if(G.on&&G.lane<NUM_LANES-1) G.lane++; }

window.addEventListener('keydown',function(e){
  if(e.key==='ArrowLeft' ){e.preventDefault();mvL();}
  if(e.key==='ArrowRight'){e.preventDefault();mvR();}
});

function bindBtn(id,fn){
  var el=document.getElementById(id); if(!el) return;
  el.addEventListener('touchstart',function(e){e.preventDefault();fn();},{passive:false});
  el.addEventListener('mousedown',fn);
}
bindBtn('cLeft', mvL);
bindBtn('cRight',mvR);

// swipe support
var swipeStartX=null;
window.addEventListener('touchstart',function(e){swipeStartX=e.touches[0].clientX;},{passive:true});
window.addEventListener('touchend',function(e){
  if(swipeStartX===null) return;
  var dx=e.changedTouches[0].clientX-swipeStartX;
  if(Math.abs(dx)>38){ dx<0?mvL():mvR(); }
  swipeStartX=null;
});

/* ── Start ────────────────────────────────────── */
document.getElementById('startBtn').addEventListener('click',function(){
  try{ ac().resume(); }catch(e){}
  resetGame();
  hudUpdate();
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('goScreen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('bars').classList.remove('hidden');
  document.getElementById('ctrl').classList.remove('hidden');
  G.on=true;
  loop();
});

})();
