const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ১. ইমেজ লোড করা
const thiefImg = new Image(); 
thiefImg.src = 'thief.png'; 
const playerImg = new Image(); 
playerImg.src = 'gun.png'; 

let gameState = {
    isRunning: false,
    hits: 0,
    score: 0,
    laneWidth: 0,
    frame: 0,
    speed: 6,
    obstacles: [],
    bullets: []
};

class Entity {
    constructor(isPlayer = false) {
        this.lane = 1;
        this.x = 0;
        this.y = 0;
        this.w = 70;
        this.h = 80;
        this.isPlayer = isPlayer;
        this.shootTimer = 0;
    }

    update() {
        let targetX = this.lane * gameState.laneWidth + (gameState.laneWidth/2) - (this.w/2);
        this.x += (targetX - this.x) * 0.15; // Smooth movement
        
        if (this.isPlayer) {
            this.y = canvas.height - 150;
            // অটো-শুটিং লজিক: চোর আর প্লেয়ার একই লেনে থাকলে গুলি বের হবে
            if (this.lane === thief.lane && this.shootTimer <= 0) {
                gameState.bullets.push({x: this.x + this.w/2 - 5, y: this.y, w: 10, h: 20});
                this.shootTimer = 30; // গুলির মাঝখানে গ্যাপ
            }
            if (this.shootTimer > 0) this.shootTimer--;
        } else {
            // চোরের মুভমেন্ট
            this.y = 80 + Math.sin(gameState.frame * 0.05) * 15;
            if (gameState.frame % 120 === 0) {
                this.lane = Math.floor(Math.random() * 3);
            }
        }
    }

    draw() {
        let img = this.isPlayer ? playerImg : thiefImg;
        if (img.complete) {
            ctx.drawImage(img, this.x, this.y, this.w, this.h);
        } else {
            ctx.fillStyle = this.isPlayer ? '#00f2ff' : '#ff4444';
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }
    }
}

const player = new Entity(true);
const thief = new Entity(false);

function spawnObstacle() {
    if (gameState.frame % 80 === 0) {
        gameState.obstacles.push({
            lane: Math.floor(Math.random() * 3),
            y: -50,
            w: 60,
            h: 40
        });
    }
}

function update() {
    if (!gameState.isRunning) return;
    gameState.frame++;
    gameState.score += 0.05;
    
    player.update();
    thief.update();
    spawnObstacle();

    // গুলির মুভমেন্ট এবং চোরকে হিট করা
    gameState.bullets.forEach((bullet, bIndex) => {
        bullet.y -= 10; // গুলির গতি
        if (bullet.x < thief.x + thief.w && bullet.x + bullet.w > thief.x &&
            bullet.y < thief.y + thief.h && bullet.y + bullet.h > thief.y) {
            gameState.hits++;
            gameState.bullets.splice(bIndex, 1);
            document.getElementById('hits').innerText = gameState.hits;
            
            if (gameState.hits >= 10) {
                gameState.isRunning = false;
                showScreen("Mission Success!", "You captured the thief!");
            }
        }
        if (bullet.y < 0) gameState.bullets.splice(bIndex, 1);
    });

    // বাধার মুভমেন্ট এবং প্লেয়ারের সাথে ধাক্কা
    gameState.obstacles.forEach((obs, oIndex) => {
        obs.y += gameState.speed;
        let obsX = obs.lane * gameState.laneWidth + (gameState.laneWidth/2) - (obs.w/2);
        
        if (obs.lane === player.lane && obs.y + obs.h > player.y && obs.y < player.y + player.h) {
            gameState.isRunning = false;
            showScreen("Game Over", "You hit an obstacle!");
        }
        if (obs.y > canvas.height) gameState.obstacles.splice(oIndex, 1);
    });
}

function draw() {
    ctx.fillStyle = '#111'; // রাস্তার রঙ
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // রাস্তার লেন আঁকা
    ctx.strokeStyle = '#333';
    ctx.setLineDash([15, 15]);
    for(let i=1; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gameState.laneWidth, 0);
        ctx.lineTo(i * gameState.laneWidth, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // গুলি আঁকা
    ctx.fillStyle = '#ffff00';
    gameState.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));

    // বাধা আঁকা (সুন্দর ট্রাফিক কোন স্টাইল)
    gameState.obstacles.forEach(obs => {
        let x = obs.lane * gameState.laneWidth + (gameState.laneWidth/2) - 25;
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(x + 25, obs.y);
        ctx.lineTo(x, obs.y + 50);
        ctx.lineTo(x + 50, obs.y + 50);
        ctx.fill();
    });

    player.draw();
    thief.draw();
    document.getElementById('score').innerText = Math.floor(gameState.score);
}

function showScreen(title, msg) {
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('hidden');
    document.getElementById('title').innerText = title;
    document.getElementById('msg').innerText = msg;
    document.getElementById('start-btn').innerText = "Play Again";
}

function gameLoop() {
    update();
    draw();
    if (gameState.isRunning) requestAnimationFrame(gameLoop);
}

// কন্ট্রোলস
window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && player.lane > 0) player.lane--;
    if (e.key === 'ArrowRight' && player.lane < 2) player.lane++;
});

document.getElementById('start-btn').onclick = () => {
    gameState.isRunning = true;
    gameState.hits = 0;
    gameState.score = 0;
    gameState.obstacles = [];
    gameState.bullets = [];
    document.getElementById('hits').innerText = "0";
    document.getElementById('overlay').classList.add('hidden');
    canvas.width = 400; canvas.height = 700;
    gameState.laneWidth = canvas.width / 3;
    gameLoop();
};
