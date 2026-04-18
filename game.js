const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ১. ইমেজ লোড
const thiefImg = new Image(); thiefImg.src = 'thief.png';
const gunImg = new Image(); thiefImg.src = 'thief.png'; // চোরের ইমেজ
const playerImg = new Image(); playerImg.src = 'gun.png'; // প্লেয়ার (বন্দুক) ইমেজ

let gameState = {
    isRunning: false,
    hits: 0,
    score: 0,
    laneWidth: 0,
    frame: 0,
    speed: 7,
    obstacles: []
};

class Entity {
    constructor(isPlayer = false) {
        this.lane = 1;
        this.x = 0;
        this.y = 0;
        this.w = 80;
        this.h = 100;
        this.isPlayer = isPlayer;
        this.yVel = 0;
        this.hitCooldown = 0;
    }

    update() {
        let targetX = this.lane * gameState.laneWidth + (gameState.laneWidth/2) - (this.w/2);
        this.x += (targetX - this.x) * 0.15;
        
        if (this.isPlayer) {
            this.y = canvas.height - 180;
            if (this.hitCooldown > 0) this.hitCooldown--;
        } else {
            this.y = 120 + Math.sin(gameState.frame * 0.1) * 10;
            if (gameState.frame % 100 === 0) this.lane = Math.floor(Math.random() * 3);
        }
    }

    draw() {
        ctx.save();
        let img = this.isPlayer ? playerImg : thiefImg;
        if (this.isPlayer && this.hitCooldown > 0) ctx.filter = 'brightness(2)';
        
        if (img.complete) {
            ctx.drawImage(img, this.x, this.y, this.w, this.h);
        } else {
            ctx.fillStyle = this.isPlayer ? '#00f2ff' : '#ff4444';
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }
        ctx.restore();
    }
}

const player = new Entity(true);
const thief = new Entity(false);

function spawnObstacle() {
    if (gameState.frame % 70 === 0) {
        gameState.obstacles.push({
            lane: Math.floor(Math.random() * 3),
            y: -50,
            type: Math.random() > 0.5 ? 'crate' : 'cone'
        });
    }
}

function update() {
    if (!gameState.isRunning) return;
    gameState.frame++;
    gameState.score += 0.1;
    
    player.update();
    thief.update();
    spawnObstacle();

    // Hit Detection (Catching the thief)
    if (player.lane === thief.lane && player.hitCooldown === 0) {
        gameState.hits++;
        player.hitCooldown = 50;
        document.getElementById('hits').innerText = gameState.hits;
        
        if (gameState.hits >= 10) {
            gameState.isRunning = false;
            showScreen("MISSION ACCOMPLISHED!", "You caught the thief 10 times!");
        }
    }

    gameState.obstacles.forEach((obs, i) => {
        obs.y += gameState.speed;
        // Collision with obstacles
        if (obs.lane === player.lane && obs.y + 40 > player.y && obs.y < player.y + 40) {
            gameState.isRunning = false;
            showScreen("GAME OVER", "You crashed into an obstacle!");
        }
        if (obs.y > canvas.height) gameState.obstacles.splice(i, 1);
    });
}

function draw() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Road Lines
    ctx.strokeStyle = '#444';
    ctx.setLineDash([20, 20]);
    for(let i=1; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gameState.laneWidth, 0);
        ctx.lineTo(i * gameState.laneWidth, canvas.height);
        ctx.stroke();
    }

    // Draw Obstacles (Wooden Crates & Cones)
    gameState.obstacles.forEach(obs => {
        let x = obs.lane * gameState.laneWidth + (gameState.laneWidth/2) - 25;
        if (obs.type === 'crate') {
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(x, obs.y, 50, 50);
            ctx.strokeStyle = '#5D2E0A';
            ctx.strokeRect(x+5, obs.y+5, 40, 40);
        } else {
            ctx.fillStyle = '#FF4500';
            ctx.beginPath();
            ctx.moveTo(x + 25, obs.y);
            ctx.lineTo(x, obs.y + 50);
            ctx.lineTo(x + 50, obs.y + 50);
            ctx.fill();
        }
    });

    player.draw();
    thief.draw();
    document.getElementById('score').innerText = Math.floor(gameState.score);
}

function showScreen(title, msg) {
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('title').innerText = title;
    document.getElementById('msg').innerText = msg;
    document.getElementById('start-btn').innerText = "TRY AGAIN";
}

function gameLoop() {
    update();
    draw();
    if (gameState.isRunning) requestAnimationFrame(gameLoop);
}

// Controls
window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && player.lane > 0) player.lane--;
    if (e.key === 'ArrowRight' && player.lane < 2) player.lane++;
});

document.getElementById('start-btn').onclick = () => {
    gameState = { ...gameState, isRunning: true, hits: 0, score: 0, obstacles: [], frame: 0 };
    document.getElementById('hits').innerText = "0";
    document.getElementById('overlay').classList.add('hidden');
    canvas.width = 400; canvas.height = 700;
    gameState.laneWidth = canvas.width / 3;
    gameLoop();
};
