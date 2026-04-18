const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ১. ক্যারেক্টার ইমেজ লোড
const thiefImg = new Image();
thiefImg.src = 'thief.png'; 

// ২. গেম কনফিগারেশন
const CONFIG = {
    laneCount: 3,
    baseSpeed: 7,
    gravity: 0.7,
    jumpPower: -16
};

let score = 0;
let isRunning = false;
let frameCount = 0;
let obstacles = [];
let laneWidth = 0;

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
        laneWidth = canvas.width / CONFIG.laneCount;
        this.y = canvas.height - this.height - 80;
        this.groundY = this.y;
    }

    update() {
        let targetX = this.lane * laneWidth + (laneWidth/2) - (this.width/2);
        this.x += (targetX - this.x) * 0.2; // Smooth lane change

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
        ctx.fillStyle = '#00f2ff';
        let drawH = this.isSliding ? this.height * 0.5 : this.height;
        let drawY = this.isSliding ? this.y + this.height * 0.5 : this.y;
        
        // হিরো বক্স (আপাতত)
        ctx.beginPath();
        ctx.roundRect(this.x, drawY, this.width, drawH, 10);
        ctx.fill();
        
        // গ্লো ইফেক্ট
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f2ff';
    }
}

class Thief {
    constructor() {
        this.lane = 1;
        this.x = 0;
        this.y = 100;
        this.width = 90;
        this.height = 110;
        this.laneTimer = 0;
    }

    update() {
        let targetX = this.lane * laneWidth + (laneWidth/2) - (this.width/2);
        this.x += (targetX - this.x) * 0.1;

        this.laneTimer++;
        if (this.laneTimer > 80) {
            this.lane = Math.floor(Math.random() * 3);
            this.laneTimer = 0;
        }
    }

    draw() {
        ctx.shadowBlur = 0; // ইমেজ এর জন্য শ্যাডো অফ
        if (thiefImg.complete) {
            let bob = Math.sin(frameCount * 0.15) * 6; // উপরে-নিচে নড়ার এনিমেশন
            ctx.drawImage(thiefImg, this.x, this.y + bob, this.width, this.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

const player = new Player();
const thief = new Thief();

function spawnObstacle() {
    if (frameCount % 60 === 0) {
        obstacles.push({
            lane: Math.floor(Math.random() * 3),
            y: -50,
            w: 70,
            h: 50
        });
    }
}

function update() {
    if (!isRunning) return;
    
    frameCount++;
    score += 0.1;
    document.getElementById('score').innerText = Math.floor(score);

    player.update();
    thief.update();
    spawnObstacle();

    obstacles.forEach((obs, index) => {
        obs.y += CONFIG.baseSpeed;
        
        // Collision
        if (obs.lane === player.lane && obs.y + obs.h > player.y && obs.y < player.y + player.height) {
            if (!player.isJumping) {
                isRunning = false;
                alert("Game Over! Score: " + Math.floor(score));
                location.reload();
            }
        }
        if (obs.y > canvas.height) obstacles.splice(index, 1);
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // রাস্তা
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // লেন লাইন
    ctx.strokeStyle = '#333';
    ctx.setLineDash([20, 20]);
    for(let i=1; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // বাধা
    ctx.fillStyle = '#ff3333';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'red';
    obstacles.forEach(obs => {
        ctx.beginPath();
        ctx.roundRect(obs.lane * laneWidth + 15, obs.y, obs.w, obs.h, 5);
        ctx.fill();
    });

    player.draw();
    thief.draw();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// কন্ট্রোলস
window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && player.lane > 0) player.lane--;
    if (e.key === 'ArrowRight' && player.lane < 2) player.lane++;
    if (e.key === 'ArrowUp' && !player.isJumping) {
        player.yVel = CONFIG.jumpPower;
        player.isJumping = true;
    }
    if (e.key === 'ArrowDown') {
        player.isSliding = true;
        player.slideTimer = 30;
    }
});

// গেম শুরু
document.getElementById('start-btn').onclick = () => {
    canvas.width = 400;
    canvas.height = 650;
    player.reset();
    document.getElementById('start-screen').classList.add('hidden');
    isRunning = true;
    gameLoop();
};
