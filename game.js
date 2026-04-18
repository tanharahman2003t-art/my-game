const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Load Assets
const thiefImg = new Image(); thiefImg.src = 'thief.png';
const gunImg = new Image(); gunImg.src = 'gun.png';

const state = {
    isRunning: false,
    score: 0,
    hits: 0,
    laneWidth: 0,
    obstacles: [],
    bullets: [],
    frame: 0,
    speed: 5
};

class Sprite {
    constructor(img, w, h, isPlayer = false) {
        this.img = img;
        this.w = w;
        this.h = h;
        this.lane = 1;
        this.x = 0;
        this.y = 0;
        this.isPlayer = isPlayer;
        this.shootTimer = 0;
    }

    update() {
        let targetX = this.lane * state.laneWidth + (state.laneWidth/2) - (this.w/2);
        this.x += (targetX - this.x) * 0.15; // Smooth Lane Change

        if (this.isPlayer) {
            this.y = canvas.height - 140;
            // Auto-shoot only if in the same lane as thief
            if (this.lane === thief.lane && this.shootTimer <= 0) {
                this.shoot();
                this.shootTimer = 25;
            }
            if (this.shootTimer > 0) this.shootTimer--;
        } else {
            // Thief AI
            this.y = 100 + Math.sin(state.frame * 0.05) * 15;
            if (state.frame % 100 === 0) this.lane = Math.floor(Math.random() * 3);
        }
    }

    shoot() {
        state.bullets.push({
            x: this.x + this.w/2 - 3,
            y: this.y,
            w: 6,
            h: 15
        });
    }

    draw() {
        if (this.img.complete) {
            ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
        } else {
            ctx.fillStyle = this.isPlayer ? '#00f2ff' : '#ff0055';
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }
    }
}

const player = new Sprite(gunImg, 60, 80, true);
const thief = new Sprite(thiefImg, 70, 90, false);

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

function handleLogic() {
    if (!state.isRunning) return;
    state.frame++;
    state.score += 0.1;
    document.getElementById('score-val').innerText = Math.floor(state.score);

    player.update();
    thief.update();

    // Bullets Logic
    state.bullets.forEach((bullet, index) => {
        bullet.y -= 12;
        if (checkCollision(bullet, thief)) {
            state.hits++;
            state.bullets.splice(index, 1);
            updateHitUI();
        }
        if (bullet.y < 0) state.bullets.splice(index, 1);
    });

    // Obstacles Logic
    if (state.frame % 90 === 0) {
        state.obstacles.push({
            lane: Math.floor(Math.random() * 3),
            y: -50,
            w: 50,
            h: 50,
            color: '#ff00ea'
        });
    }

    state.obstacles.forEach((obs, index) => {
        obs.y += state.speed + (state.hits * 0.2); // Speed increases with hits
        let obsX = obs.lane * state.laneWidth + (state.laneWidth/2) - (obs.w/2);
        
        let obsRect = { x: obsX, y: obs.y, w: obs.w, h: obs.h };
        if (checkCollision(player, obsRect)) {
            endGame("MISSION FAILED", "You crashed into a cyber-barrier!");
        }

        if (obs.y > canvas.height) state.obstacles.splice(index, 1);
    });

    if (state.hits >= 10) {
        endGame("MISSION SUCCESS", "The thief has been neutralized!");
    }
}

function updateHitUI() {
    const progress = (state.hits / 10) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('hit-count').innerText = `${state.hits}/10`;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background Road Effect
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    for(let i=1; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * state.laneWidth, 0);
        ctx.lineTo(i * state.laneWidth, canvas.height);
        ctx.stroke();
    }

    // Bullets
    ctx.fillStyle = '#00f2ff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f2ff';
    state.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));

    // Obstacles
    state.shadowBlur = 15;
    state.obstacles.forEach(obs => {
        let x = obs.lane * state.laneWidth + (state.laneWidth/2) - (obs.w/2);
        ctx.fillStyle = obs.color;
        ctx.shadowColor = obs.color;
        ctx.fillRect(x, obs.y, obs.w, obs.h);
    });

    ctx.shadowBlur = 0; // Reset glow for images
    player.draw();
    thief.draw();
}

function endGame(title, msg) {
    state.isRunning = false;
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('result-title').innerText = title;
    document.getElementById('result-msg').innerText = msg;
}

function gameLoop() {
    handleLogic();
    draw();
    if (state.isRunning) requestAnimationFrame(gameLoop);
}

// Controls
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && player.lane > 0) player.lane--;
    if (e.key === 'ArrowRight' && player.lane < 2) player.lane++;
});

// Initialization
document.getElementById('start-btn').onclick = () => {
    canvas.width = 400;
    canvas.height = 650;
    state.laneWidth = canvas.width / 3;
    state.isRunning = true;
    document.getElementById('start-screen').classList.add('hidden');
    gameLoop();
};
