const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// lanes
const lanes = [
  canvas.width / 2 - 120,
  canvas.width / 2,
  canvas.width / 2 + 120
];

// player (gun runner)
let laneIndex = 1;
let player = {
  x: lanes[laneIndex],
  y: canvas.height - 150,
  width: 80,
  height: 80,
  dy: 0,
  gravity: 0.8,
  jump: -14,
  grounded: true
};

// thief (target)
let thief = {
  x: lanes[1],
  y: 100,
  width: 80,
  height: 80,
  speed: 2
};

// images
const playerImg = new Image();
playerImg.src = "gun.png";

const thiefImg = new Image();
thiefImg.src = "thief.png";

// game data
let bullets = [];
let obstacles = [];
let ammoItems = [];

let ammo = 0;
let hits = 0;
let score = 0;

// controls
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" && laneIndex > 0) laneIndex--;
  if (e.key === "ArrowRight" && laneIndex < 2) laneIndex++;

  if ((e.key === " " || e.key === "ArrowUp") && player.grounded) {
    player.dy = player.jump;
  }

  if (e.key === "f" && ammo > 0) {
    bullets.push({
      x: player.x,
      y: player.y,
      width: 10,
      height: 20
    });
    ammo--;
  }
});

// spawn obstacles
setInterval(() => {
  obstacles.push({
    x: lanes[Math.floor(Math.random() * 3)],
    y: -50,
    width: 60,
    height: 60
  });
}, 1200);

// spawn ammo
setInterval(() => {
  ammoItems.push({
    x: lanes[Math.floor(Math.random() * 3)],
    y: -50,
    width: 40,
    height: 40
  });
}, 2000);

// draw road
function drawRoad() {
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "white";
  ctx.setLineDash([20, 20]);

  for (let i = 0; i < canvas.height; i += 40) {
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 120, i);
    ctx.lineTo(canvas.width / 2 - 120, i + 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 + 120, i);
    ctx.lineTo(canvas.width / 2 + 120, i + 20);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

// draw player
function drawPlayer() {
  ctx.drawImage(
    playerImg,
    player.x - player.width / 2,
    player.y,
    player.width,
    player.height
  );
}

// draw thief
function drawThief() {
  ctx.drawImage(
    thiefImg,
    thief.x - thief.width / 2,
    thief.y,
    thief.width,
    thief.height
  );
}

// collision check
function isColliding(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// update
function update() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawRoad();

  // smooth lane move
  player.x += (lanes[laneIndex] - player.x) * 0.2;

  // gravity
  player.y += player.dy;
  if (player.y + player.height < canvas.height) {
    player.dy += player.gravity;
    player.grounded = false;
  } else {
    player.dy = 0;
    player.grounded = true;
    player.y = canvas.height - player.height;
  }

  drawPlayer();
  drawThief();

  // bullets
  bullets.forEach((b, i) => {
    b.y -= 10;
    ctx.fillStyle = "yellow";
    ctx.fillRect(b.x - 5, b.y, b.width, b.height);

    // hit thief
    if (isColliding(b, {
      x: thief.x - thief.width / 2,
      y: thief.y,
      width: thief.width,
      height: thief.height
    })) {
      bullets.splice(i, 1);
      hits++;
      thief.speed = 1; // slow effect

      setTimeout(() => {
        thief.speed = 2;
      }, 1000);
    }
  });

  // obstacles
  obstacles.forEach((o, i) => {
    o.y += 6;
    ctx.fillStyle = "red";
    ctx.fillRect(o.x - 30, o.y, o.width, o.height);

    if (isColliding(player, {
      x: o.x - 30,
      y: o.y,
      width: o.width,
      height: o.height
    })) {
      alert("Game Over!");
      location.reload();
    }
  });

  // ammo
  ammoItems.forEach((a, i) => {
    a.y += 5;
    ctx.fillStyle = "cyan";
    ctx.fillRect(a.x - 20, a.y, a.width, a.height);

    if (isColliding(player, {
      x: a.x - 20,
      y: a.y,
      width: a.width,
      height: a.height
    })) {
      ammo++;
      ammoItems.splice(i, 1);
    }
  });

  // win condition
  if (hits >= 10) {
    alert("You caught the thief! 🎉");
    location.reload();
  }

  // UI
  score++;
  document.getElementById("score").innerText = "Score: " + score;
  document.getElementById("ammo").innerText = "Ammo: " + ammo;
  document.getElementById("hits").innerText = "Hits: " + hits + " / 10";

  requestAnimationFrame(update);
}

// start
thiefImg.onload = () => {
  update();
};
