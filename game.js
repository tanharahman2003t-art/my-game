/**
 * THIEF TRACKER - CORE GAME LOGIC
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration ---
const CONFIG = {
    laneCount: 3,
    baseSpeed: 7,
    maxSpeed: 18,
    accel: 0.002,
    gravity: 0.7,
    jumpPower: -16,
    missionGoal: 3, // Hits required to catch thief
};

// --- Game State ---
let state = {
    isRunning: false,
    speed: CONFIG.baseSpeed,
    score: 0,
    bottles: 0,
    thiefHits: 0,
    laneWidth: 0,
    lastObstacle: 0,
    lastCollectible: 0,
    cameraShake: 0
};

// --- Entities ---
class Entity {
    constructor() {
        this.lane = 1;
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.targetX = 0;
    }

    updateX() {
        this.targetX = this.lane * state.laneWidth + (state.laneWidth / 2) - (this.width / 2);
        // Smooth horizontal movement (Lerp)
        this.x += (this.targetX - this.x) * 0.2;
    }
}

class Player extends Entity {
    constructor() {
        super();
        this.yVel = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.slideTimer = 0;
    }

    reset() {
        this.width = state.laneWidth * 0.6;
        this.height = this.width * 1.5;
        this.lane = 1;
        this.y = canvas.height - this.height - 80;
        this.groundY = this.y;
    }

    jump() {
        if (!this.isJumping && !this.isSliding) {
            this.yVel = CONFIG.jumpPower;
            this.isJumping = true;
        }
    }

    slide() {
        if (!this.isJumping) {
            this.isSliding = true;
            this.slideTimer = 30; // Frames
        }
    }

    update() {
        this.updateX();
        
        // Physics
        this.y += this.yVel;
        this.yVel += CONFIG.gravity;

        if (this.y >= this.groundY) {
            this.y = this.groundY;
            this.yVel = 0;
            this.isJumping = false;
        }

        if (this.isSliding) {
            this.slideTimer--;
            if (this.slideTimer <= 0) this.isSliding = false;
        }
    }

    draw() {
        ctx.save();
        ctx.fillStyle = '#00f2ff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f2ff';
        
        let drawH = this.isSliding ? this.height * 0.5 : this.height;
        let drawY = this.isSliding ? this.y + this.height * 0.5 : this.y;
        
        ctx.beginPath();
        ctx.roundRect(this.x, drawY, this.width, drawH, 8);
        ctx.fill();
        ctx.restore();
    }
}

class Thief extends Entity {
    constructor() {
        super();
        this.laneTimer = 0;
        this.slowdown = 0;
    }

    reset() {
        this.width = state.laneWidth * 0.5;
        this.height = this.width * 1.4;
        this.y = 150;
    }

    update() {
        this.updateX();
        // Simple AI: Change lanes periodically
        this.laneTimer++;
        if (this.laneTimer > 120) {
            this.lane = Math.floor(Math.random() * 3);
            this.laneTimer = 0;
        }
        if (this.slowdown > 0) this.slowdown--;
    }

    draw() {
        ctx.fillStyle = this.slowdown > 0 ? '#fff' : '#ff0055';
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, 5);
        ctx.fill();
        // Thief head
        ctx.fillRect(this.x + this.width/4, this.y - 20, this.width/2, 20);
    }
}

class Obstacle {
    constructor(type, lane) {
        this.type = type; // 'low', 'high', 'side'
        this.lane = lane;
        this.width = state.laneWidth * 0.8;
        this.height = type === 'high' ? 120 : 50;
        this.x = lane * state.laneWidth + (state.laneWidth/2) - (this.width/2);
        this.y = -200;
        this.passed = false;
    }

    update() {
        this.y += (thief.slowdown > 0) ? state.speed * 0.5 : state.speed;
    }

    draw() {
        ctx.fillStyle = this.type === 'high' ? '#ffaa00' : '#ff4444';
        if (this.type === 'high') {
            // Archway
            ctx.fillRect(this.x, this.y, this.width, 30);
        } else {
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Projectile {
    constructor(x, y, lane) {
        this.x = x;
        this.y = y;
        this.lane = lane;
        this.speed = 15;
    }
    update() { this.y -= this.speed; }
    draw() {
        ctx.fillStyle = '#00f2ff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Collectible {
    constructor(lane) {
        this.lane = lane;
        this.width = 30;
        this.height = 30;
        this.x = lane * state.laneWidth + (state.laneWidth/2) - (this.width/2);
        this.y = -100;
    }
    update() { this.y += state.speed; }
    draw() {
        ctx.fillStyle = '#39ff14';
        ctx.beginPath();
        ctx.moveTo(this.x + 15, this.y);
        ctx.lineTo(this.x + 30, this.y + 30);
        ctx.lineTo(this.x, this.y + 30);
        ctx.fill();
    }
}

// --- Manager Instances ---
const player = new Player();
const thief = new Thief();
let obstacles = [];
let projectiles = [];
let collectibles = [];

// --- System Functions ---

function init() {
    resize();
    window.addEventListener('resize', resize);
    setupControls();
}

function resize() {
    canvas.width = document.getElementById('game-container').clientWidth;
    canvas.height = document.getElementById('game-container').clientHeight;
    state.laneWidth = canvas.width / CONFIG.laneCount;
    player.reset();
    thief.reset();
}

function spawnLogic(time) {
    if (time - state.lastObstacle > 1500 - (state.speed * 40)) {
        const type = Math.random() > 0.5 ? 'low' : 'high';
        obstacles.push(new Obstacle(type, Math.floor(Math.random() * 3)));
        state.lastObstacle = time;
    }
    if (time - state.lastCollectible > 4000) {
        collectibles.push(new Collectible(Math.floor(Math.random() * 3)));
        state.lastCollectible = time;
    }
}

function checkCollisions() {
    // 1. Obstacles vs Player
    obstacles.forEach(obs => {
        if (obs.lane === player.lane) {
            let collision = false;
            const pTop = player.y;
            const pBottom = player.y + player.height;

            if (obs.type === 'low' && !player.isJumping) {
                if (obs.y + obs.height > pTop + 20 && obs.y < pBottom) collision = true;
            }
            if (obs.type === 'high' && !player.isSliding) {
                if (obs.y + 30 > pTop && obs.y < pTop + 50) collision = true;
            }

            if (collision) endGame(false);
        }
    });

    // 2. Projectiles vs Thief
    projectiles.forEach((p, index) => {
        if (p.lane === thief.lane && p.y < thief.y + thief.height && p.y > thief.y) {
            projectiles.splice(index, 1);
            state.thiefHits++;
            thief.slowdown = 90;
            state.score += 500;
            state.cameraShake = 10;
            if (state.thiefHits >= CONFIG.missionGoal) endGame(true);
        }
    });

    // 3. Collectibles vs Player
    collectibles.forEach((c, index) => {
        if (c.lane === player.lane && c.y + c.height > player.y && c.y < player.y + player.height) {
            collectibles.splice(index, 1);
            state.bottles++;
        }
    });
}

function drawBackground() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Road markers
    ctx.strokeStyle = '#333';
    ctx.setLineDash([20, 20]);
    for(let i=1; i<CONFIG.laneCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * state.laneWidth, 0);
        ctx.lineTo(i * state.laneWidth, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

function updateHUD() {
    document.getElementById('score-val').innerText = Math.floor(state.score);
    document.getElementById('item-count').innerText = state.bottles;
    document.getElementById('mission-progress').innerText = state.thiefHits;
}

function gameLoop(time) {
    if (!state.isRunning) return;

    // Shake effect
    ctx.save();
    if (state.cameraShake > 0) {
        ctx.translate(Math.random() * 5 - 2.5, Math.random() * 5 - 2.5);
        state.cameraShake--;
    }

    drawBackground();
    spawnLogic(time);

    // Update Speed
    if (state.speed < CONFIG.maxSpeed) state.speed += CONFIG.accel;
    state.score += state.speed / 10;

    // Entities
    thief.update();
    thief.draw();
    
    player.update();
    player.draw();

    // Arrays
    obstacles.forEach((o, i) => { o.update(); o.draw(); if(o.y > canvas.height) obstacles.splice(i,1); });
    projectiles.forEach((p, i) => { p.update(); p.draw(); if(p.y < 0) projectiles.splice(i,1); });
    collectibles.forEach((c, i) => { c.update(); c.draw(); if(c.y > canvas.height) collectibles.splice(i,1); });

    checkCollisions();
    updateHUD();

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

// --- Input & Control ---

function setupControls() {
    window.addEventListener('keydown', e => {
        if (!state.isRunning) return;
        if (e.key === 'ArrowLeft') player.lane = Math.max(0, player.lane - 1);
        if (e.key === 'ArrowRight') player.lane = Math.min(2, player.lane + 1);
        if (e.key === 'ArrowUp' || e.key === ' ') player.jump();
        if (e.key === 'ArrowDown') player.slide();
        if (e.key.toLowerCase() === 'f') throwBottle();
    });

    // Touch Support
    let touchX = 0, touchY = 0;
    canvas.addEventListener('touchstart', e => {
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
    });

    canvas.addEventListener('touchend', e => {
        if (!state.isRunning) return;
        const dx = e.changedTouches[0].clientX - touchX;
        const dy = e.changedTouches[0].clientY - touchY;

        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 30) player.lane = Math.min(2, player.lane + 1);
            else if (dx < -30) player.lane = Math.max(0, player.lane - 1);
        } else {
            if (dy < -30) player.jump();
            else if (dy > 30) player.slide();
            else throwBottle();
        }
    });
}

function throwBottle() {
    if (state.bottles > 0) {
        projectiles.push(new Projectile(player.x + player.width/2, player.y, player.lane));
        state.bottles--;
    }
}

function startGame() {
    state.isRunning = true;
    state.score = 0;
    state.bottles = 0;
    state.thiefHits = 0;
    state.speed = CONFIG.baseSpeed;
    obstacles = [];
    projectiles = [];
    collectibles = [];
    
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('hud').classList.remove('hidden');
    requestAnimationFrame(gameLoop);
}

function endGame(isSuccess) {
    state.isRunning = false;
    document.getElementById('hud').classList.add('hidden');
    
    if (isSuccess) {
        document.getElementById('success-screen').classList.remove('hidden');
        document.getElementById('success-score').innerText = Math.floor(state.score);
    } else {
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').innerText = Math.floor(state.score);
    }
}

// Button Events
document.getElementById('start-btn').onclick = startGame;
document.getElementById('retry-btn').onclick = startGame;
document.getElementById('next-btn').onclick = startGame;

init();
