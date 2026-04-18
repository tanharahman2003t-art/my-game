/**
 * THIEF TRACKER - CHASE GAME (IMAGE VERSION)
 */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ১. Thief Image Load Kora
const thiefImg = new Image();
thiefImg.src = 'thief.png'; // Apnar image file-er naam

const CONFIG = {
    laneCount: 3,
    baseSpeed: 7,
    maxSpeed: 15,
    accel: 0.001,
    gravity: 0.7,
    jumpPower: -15,
    missionGoal: 3
};

let state = {
    isRunning: false,
    speed: CONFIG.baseSpeed,
    score: 0,
    bottles: 0,
    thiefHits: 0,
    laneWidth: 0,
    lastObstacle: 0,
    animationFrame: 0
};

// --- Player (The Chaser - Blue Hero) ---
class Player {
    constructor() {
        this.lane = 1;
        this.x = 0;
        this.y = 0;
        this.width = 60;
        this.height = 90;
        this.yVel = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.slideTimer = 0;
    }

    reset() {
        this.width = state.laneWidth * 0.6;
        this.height = this.width * 1.5;
        this.y = canvas.height - this.height - 80;
        this.groundY = this.y;
    }

    update() {
        let targetX = this.lane * state.laneWidth + (state.laneWidth/2) - (this.width/2);
        this.x += (targetX - this.x) * 0.2; // Smooth movement

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
        ctx.fillStyle = '#00f2ff'; // Hero color
        let drawH = this.isSliding ? this.height * 0.5 : this.height;
        let drawY = this.isSliding ? this.y + this.height * 0.5 : this.y;
        ctx.beginPath();
        ctx.roundRect(this.x, drawY, this.width, drawH, 10);
        ctx.fill();
    }
}

// --- Thief (The Character you provided) ---
class Thief {
    constructor() {
        this.lane = 1;
        this.x = 0;
        this.y = 100;
        this.width = 80;
        this.height = 100;
        this.laneTimer = 0;
        this.slowdown = 0;
    }

    update() {
        let targetX = this.lane * state.laneWidth + (state.laneWidth/2) - (this.width/2);
        this.x += (targetX - this.x) * 0.1;

        // Thief AI: Change lanes
        this.laneTimer++;
        if (this.laneTimer > 100) {
            this.lane = Math.floor(Math.random() * 3);
            this.laneTimer = 0;
        }
        if (this.slowdown > 0) this.slowdown--;
    }

    draw() {
        if (thiefImg.complete) {
            // Douranor ekta natural feel deyar jonno 'Bobbing' effect
            let bob = Math.sin(state.animationFrame * 0.2) * 5;
            
            ctx.save();
            if (this.slowdown > 0) ctx.filter = 'brightness(2) contrast(1.5)'; // Hit effect
            ctx.drawImage(thiefImg, this.x, this.y + bob, this.width, this.height);
            ctx.restore();
        } else {
            ctx.fillStyle = 'red'; // Backup
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

const player = new Player();
const thief = new Thief();
let obstacles = [];

function init() {
    canvas.width = 400;
    canvas.height = 650;
    state.laneWidth = canvas.width / 3;
    player.reset();
    
    // Start button logic
    document.getElementById('start-btn').onclick = () => {
        document.getElementById('start-screen').classList.add('hidden');
        state.isRunning = true;
        gameLoop();
    };
}

function gameLoop() {
    if (!state.isRunning) return;
    
    state.animationFrame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background Road
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    player.update();
    player.draw();

    thief.update();
    thief.draw();

    // Spawning Obstacles
    if (state.animationFrame % 100 === 0) {
        obstacles.push({
            lane: Math.floor(Math.random() * 3),
            y: -50,
            w: 60,
            h: 40
        });
    }

    obstacles.forEach((obs, i) => {
        obs.y += state.speed;
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(obs.lane * state.laneWidth + 20, obs.y, obs.w, obs.h);
        
        // Collision with player
        if (obs.lane === player.lane && obs.y + obs.h > player.y && obs.y < player.y + player.height) {
            if (!player.isJumping) {
                alert("The Thief escaped!");
                location.reload();
            }
        }
        if (obs.y > canvas.height) obstacles.splice(i, 1);
    });

    requestAnimationFrame(gameLoop);
}

// Controls
window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && player.lane > 0) player.lane--;
    if (e.key === 'ArrowRight' && player.lane < 2) player.lane++;
    if (e.key === 'ArrowUp') {
        if (!player.isJumping) {
            player.yVel = CONFIG.jumpPower;
            player.isJumping = true;
        }
    }
    if (e.key === 'ArrowDown') {
        player.isSliding = true;
        player.slideTimer = 30;
    }
});

init();
