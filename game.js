/**
 * LANE RUNNER PRO
 * A high-performance 2D endless runner using Canvas API
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Game Configuration ---
const CONFIG = {
    laneCount: 3,
    baseSpeed: 5,
    maxSpeed: 15,
    acceleration: 0.001,
    gravity: 0.8,
    jumpPower: -15,
    spawnRate: 1500, // ms between obstacle spawns
    playerColor: '#00ffcc',
    obstacleColor: '#ff4d4d',
    roadColor: '#333',
    laneMarkerColor: '#555'
};

// --- Game State ---
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let currentSpeed = CONFIG.baseSpeed;
let lastSpawnTime = 0;
let animationId;

// --- Assets (Procedural Audio) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(20, audioCtx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    }
}

// --- Classes ---
class Player {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.lane = 1; // 0: Left, 1: Center, 2: Right
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.yVelocity = 0;
        this.isJumping = false;
        this.groundY = 0;
    }

    resize() {
        this.width = canvas.width / (CONFIG.laneCount + 1);
        this.height = this.width * 1.2;
        this.groundY = canvas.height - this.height - 50;
        this.y = this.groundY;
        this.updateTargetX();
        this.x = this.targetX;
    }

    updateTargetX() {
        const laneWidth = canvas.width / CONFIG.laneCount;
        this.targetX = (this.lane * laneWidth) + (laneWidth / 2) - (this.width / 2);
    }

    move(dir) {
        if (dir === 'left' && this.lane > 0) this.lane--;
        if (dir === 'right' && this.lane < 2) this.lane++;
        this.updateTargetX();
    }

    jump() {
        if (!this.isJumping) {
            this.yVelocity = CONFIG.jumpPower;
            this.isJumping = true;
            playSound('jump');
        }
    }

    update() {
        // Horizontal Lerp (Smooth lane switching)
        this.x += (this.targetX - this.x) * 0.2;

        // Vertical Physics
        this.y += this.yVelocity;
        this.yVelocity += CONFIG.gravity;

        if (this.y >= this.groundY) {
            this.y = this.groundY;
            this.yVelocity = 0;
            this.isJumping = false;
        }
    }

    draw() {
        ctx.fillStyle = CONFIG.playerColor;
        // Draw body with shadow for pseudo-3D look
        ctx.shadowBlur = 15;
        ctx.shadowColor = CONFIG.playerColor;
        
        // Simple rounded rect for character
        const r = 10;
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, [r]);
        ctx.fill();
        
        ctx.shadowBlur = 0; // Reset shadow
    }
}

class Obstacle {
    constructor(lane) {
        this.lane = lane;
        this.width = canvas.width / (CONFIG.laneCount + 1.2);
        this.height = 40;
        this.x = 0;
        this.y = -this.height;
        this.updatePosition();
    }

    updatePosition() {
        const laneWidth = canvas.width / CONFIG.laneCount;
        this.x = (this.lane * laneWidth) + (laneWidth / 2) - (this.width / 2);
    }

    update() {
        this.y += currentSpeed;
    }

    draw() {
        ctx.fillStyle = CONFIG.obstacleColor;
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, [5]);
        ctx.fill();
    }
}

// --- Instance Creation ---
const player = new Player();
let obstacles = [];

// --- Logic Functions ---

function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    player.resize();
    obstacles.forEach(obs => obs.updatePosition());
}

function spawnObstacle() {
    const lane = Math.floor(Math.random() * CONFIG.laneCount);
    obstacles.push(new Obstacle(lane));
}

function checkCollision(p, o) {
    // Narrow collision box for fairer gameplay
    const pBox = {
        left: p.x + 5,
        right: p.x + p.width - 5,
        top: p.y + 5,
        bottom: p.y + p.height - 5
    };
    
    const oBox = {
        left: o.x,
        right: o.x + o.width,
        top: o.y,
        bottom: o.y + o.height
    };

    return pBox.left < oBox.right &&
           pBox.right > oBox.left &&
           pBox.top < oBox.bottom &&
           pBox.bottom > oBox.top;
}

function gameOver() {
    gameState = 'GAMEOVER';
    playSound('hit');
    cancelAnimationFrame(animationId);
    
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('final-score').innerText = Math.floor(score);
    document.getElementById('hud').classList.add('hidden');
}

function resetGame() {
    score = 0;
    currentSpeed = CONFIG.baseSpeed;
    obstacles = [];
    player.lane = 1;
    player.updateTargetX();
    player.x = player.targetX;
    gameState = 'PLAYING';
    
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    requestAnimationFrame(gameLoop);
}

// --- Main Loop ---

let roadOffset = 0;
function drawBackground() {
    // Draw Road
    ctx.fillStyle = CONFIG.roadColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Lane Markers
    ctx.strokeStyle = CONFIG.laneMarkerColor;
    ctx.setLineDash([40, 40]);
    ctx.lineWidth = 4;
    
    roadOffset = (roadOffset + currentSpeed) % 80;
    ctx.lineDashOffset = -roadOffset;

    for (let i = 1; i < CONFIG.laneCount; i++) {
        const x = (canvas.width / CONFIG.laneCount) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash
}

function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Update Speed & Score
    if (currentSpeed < CONFIG.maxSpeed) currentSpeed += CONFIG.acceleration;
    score += currentSpeed / 10;
    document.getElementById('score-display').innerText = `Score: ${Math.floor(score)}`;

    // 2. Spawn Logic
    if (timestamp - lastSpawnTime > CONFIG.spawnRate / (currentSpeed / 5)) {
        spawnObstacle();
        lastSpawnTime = timestamp;
    }

    // 3. Draw Static Background
    drawBackground();

    // 4. Update & Draw Player
    player.update();
    player.draw();

    // 5. Update & Draw Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.update();
        obs.draw();

        // Collision Check
        if (checkCollision(player, obs)) {
            gameOver();
            return;
        }

        // Cleanup off-screen obstacles
        if (obs.y > canvas.height) {
            obstacles.splice(i, 1);
        }
    }

    animationId = requestAnimationFrame(gameLoop);
}

// --- Input Handling ---

// Keyboard
window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING') return;
    
    switch(e.key) {
        case 'ArrowLeft': player.move('left'); break;
        case 'ArrowRight': player.move('right'); break;
        case 'ArrowUp':
        case ' ': player.jump(); break;
    }
});

// Mobile Touch (Swipes)
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
});

window.addEventListener('touchend', (e) => {
    if (gameState !== 'PLAYING') return;
    
    const xDist = e.changedTouches[0].screenX - touchStartX;
    const yDist = e.changedTouches[0].screenY - touchStartY;

    // Detect Swipe direction
    if (Math.abs(xDist) > Math.abs(yDist)) {
        if (xDist > 30) player.move('right');
        else if (xDist < -30) player.move('left');
    } else {
        if (yDist < -30) player.jump(); // Swipe Up to jump
    }
    
    // Tap to jump (if not a swipe)
    if (Math.abs(xDist) < 10 && Math.abs(yDist) < 10) {
        player.jump();
    }
});

// UI Events
document.getElementById('start-btn').addEventListener('click', resetGame);
document.getElementById('restart-btn').addEventListener('click', resetGame);

// Initialization
window.addEventListener('resize', resizeCanvas);
resizeCanvas();