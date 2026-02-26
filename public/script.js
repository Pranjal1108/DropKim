// === RGS CONNECTION SYSTEM ===
const rgsErrorOverlay = document.getElementById('rgsErrorOverlay');
const rgsErrorUrlEl = document.getElementById('rgsErrorUrl');
const rgsRetryBtn = document.getElementById('rgsRetryBtn');

let rgsUrl = null; // null means use local math (backward compatible)
let rgsConnected = false;

function getRgsUrlFromParams() {
  const params = new URLSearchParams(window.location.search);
  return params.get('rgs') || null;
}

function showRgsError(url) {
  rgsErrorUrlEl.textContent = url ? `Server: ${url}` : 'No RGS URL configured';
  rgsErrorOverlay.classList.add('visible');
}

function hideRgsError() {
  rgsErrorOverlay.classList.remove('visible');
}

async function checkRgsHealth(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.status === 'ok';
  } catch (e) {
    console.warn('RGS health check failed:', e.message);
    return false;
  }
}

async function initRgsConnection() {
  rgsUrl = getRgsUrlFromParams();
  if (!rgsUrl) {
    // No RGS URL — use local math, game works standalone
    console.log('No ?rgs= param — using local math for outcomes.');
    rgsConnected = false;
    hideRgsError();
    return true;
  }

  console.log(`Checking RGS at: ${rgsUrl}`);
  const ok = await checkRgsHealth(rgsUrl);
  if (ok) {
    console.log('RGS connected successfully.');
    rgsConnected = true;
    hideRgsError();
    return true;
  } else {
    console.error('RGS connection failed.');
    rgsConnected = false;
    showRgsError(rgsUrl);
    return false;
  }
}

rgsRetryBtn.addEventListener('click', async () => {
  rgsRetryBtn.disabled = true;
  rgsRetryBtn.textContent = 'Connecting...';
  const ok = await initRgsConnection();
  rgsRetryBtn.disabled = false;
  rgsRetryBtn.textContent = 'Retry';
});

// Detect URL changes (back/forward, hash changes)
window.addEventListener('popstate', () => {
  const newUrl = getRgsUrlFromParams();
  if (newUrl !== rgsUrl) {
    initRgsConnection();
  }
});

// Re-validate when tab regains focus (user may have edited URL bar)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const newUrl = getRgsUrlFromParams();
    if (newUrl !== rgsUrl) {
      initRgsConnection();
    }
  }
});

// Run initial RGS check
initRgsConnection();

// === AUDIO SYSTEM ===
const backgroundMusic = new Audio('items/background_music.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0;

let bgMusicFading = false;
let bgMusicTargetVolume = 0;

let planeSound = null;
let planeSoundPlaying = false;

// Explosion system for zero payout
const BODY_PARTS = [
  { name: 'head', image: 'items/Head.png', offsetX: 0, offsetY: -100, size: 80 },
  { name: 'torso', image: 'items/torso.png', offsetX: 0, offsetY: 0, size: 120 },
  { name: 'left_arm', image: 'items/left_arm.png', offsetX: -60, offsetY: -20, size: 60 },
  { name: 'right_arm', image: 'items/right_arm.png', offsetX: 60, offsetY: -20, size: 60 },
  { name: 'left_leg', image: 'items/left_leg.png', offsetX: -30, offsetY: 80, size: 80 },
  { name: 'right_leg', image: 'items/right_leg.png', offsetX: 30, offsetY: 80, size: 80 }
];

let explosionParts = [];
let explosionActive = false;
let explosionTriggered = false;
let isZeroPayoutExplosion = false;

function fadeBackgroundMusic(targetVolume, duration = 2000) {
  bgMusicTargetVolume = targetVolume;
  bgMusicFading = true;
  const startVolume = backgroundMusic.volume;
  const startTime = performance.now();

  function fade() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    backgroundMusic.volume = startVolume + (targetVolume - startVolume) * progress;

    if (progress < 1) {
      requestAnimationFrame(fade);
    } else {
      bgMusicFading = false;
    }
  }

  fade();
}

function playSound(soundPath, volume = 1) {
  if (soundMuted) return null;
  const audio = new Audio(soundPath);
  audio.volume = volume;
  audio.play().catch(e => console.warn('Sound play failed:', e));
  return audio;
}

// === INTRO LOGIC ===
let introFinished = false;
const introVideo = document.getElementById("introVideo");
const introImage = document.getElementById("introImage");

// Real Asset Preloading + Min 4s Duration
(function () {
  const minTime = 4000; // Minimum visual time (4 seconds)
  const startTime = performance.now();
  let loadedCount = 0;

  // Define critical assets to wait for
  const assets = [
    // Removed non-existent sound files to prevent 404 errors
  ];
  const totalAssets = assets.length;
  const updateProgressBar = (percent) => {
    const bar = document.getElementById("loadingBarFill");
    if (bar) bar.style.width = `${percent}%`;
  };
  const finishLoading = () => {
    updateProgressBar(100);
    const elapsed = performance.now() - startTime;
    // Calculate remaining time if any (should be 0 if we waited correctly)
    const remaining = Math.max(0, minTime - elapsed);
    setTimeout(() => {
      const overlay = document.getElementById("loadingOverlay");
      if (overlay) {
        overlay.style.opacity = "0"; // Fade out
        setTimeout(() => {
          overlay.style.display = "none"; // Remove from DOM
          showIntroImage();
        }, 500); // Fade duration
      }
    }, remaining);
  };
  // Progress Interval (updates every 50ms)
  const interval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    // Calculate "Time Progress": 0% -> 90% over 4 seconds
    const timeProgress = Math.min(90, (elapsed / minTime) * 100);

    // Logic:
    // If assets are NOT done, cap at 90%.
    // If assets ARE done, use the Time Progress (which allows it to reach 100% when time is up).
    // If both Time & Assets are done, we finish.
    if (loadedCount === totalAssets) {
      // Assets are ready: Allow bar to fill up to 100% based on time
      // If elapsed > minTime, this goes > 100% (handled by finishLoading)
      const completionTimeProgress = Math.min(100, (elapsed / minTime) * 100);
      updateProgressBar(completionTimeProgress);
    } else {
      // Assets still loading: Show progress but stall at 90%
      updateProgressBar(timeProgress);
    }
    // Completion Check: Time is up AND Assets are loaded
    if (elapsed >= minTime && loadedCount === totalAssets) {
      clearInterval(interval);
      finishLoading();
    }
  }, 50);
  // Start Loading Assets
  assets.forEach((src) => {
    const audio = new Audio();
    audio.src = src;

    // Success Handler
    audio.oncanplaythrough = () => {
      loadedCount++;
      // Note: We don't call finishLoading() here immediately.
      // We let the 'interval' pick up the 'loadedCount' change to keep it synchronized.
    };

    // Error Handler (Don't block app start on missing audio)
    audio.onerror = () => {
      console.warn(`Failed to load ${src}`);
      loadedCount++;
    };

    audio.load();
  });
})();

function showIntroImage() {
  introImage.style.display = "block";
  document.addEventListener("keydown", onKeyPress);
  document.addEventListener("click", onKeyPress);
}

function onKeyPress() {
  introImage.style.display = "none";
  document.removeEventListener("keydown", onKeyPress);
  document.removeEventListener("click", onKeyPress);
  introFinished = true;
  backgroundMusic.play().catch(e => console.warn('Background music play failed:', e));
  fadeBackgroundMusic(0.3); // Fade in to 30% volume
  requestAnimationFrame(update); // Start the game loop
}

// === PERFORMANCE CONSTANTS ===
const REUSE_DISTANCE = 1500;
const CLOUD_RESPAWN_AHEAD = 5000;

const gameScale = document.getElementById("game-scale");
function scaleGame() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1200);
  gameScale.style.setProperty('--game-scale', scale);
}
window.addEventListener("resize", scaleGame);
scaleGame();

const world = document.getElementById("world");
const player = document.getElementById("player");
const scoreEl = document.getElementById("score");
world.style.pointerEvents = "none";

const betInput = document.getElementById("betAmount");
const betBtn = document.getElementById("placeBet");
const plusBtn = document.getElementById("plus");
const minusBtn = document.getElementById("minus");
balanceEl = document.getElementById("balance");
const ground = document.getElementById("ground");

let balance = 1000;
let betAmount = 10;
let bonusMode = false;
let noZeroMode = false;
let chaosMode = false;
let multiplierBet = 10;


let frameCounter = 0;

const SCREEN_W = 1920;
const SCREEN_H = 1200;

const WORLDH = 20000;
world.style.height = WORLDH + "px";

const GROUND_HEIGHT = 700;
const GROUND_Y = WORLDH - GROUND_HEIGHT;
const DEADZONE = 1500;

ground.style.height = (GROUND_HEIGHT * 1.3) + "px";
ground.style.top = 18800 + "px";
ground.style.width = "16400px";
ground.style.backgroundSize = "8200px 130%";


const cloudquantity = 700;
const darkcloudquantity = 50;
const PRESET_SPAWN_COUNT = 600;

const BH_RADIUS = 100;
const BH_SIZE = 300;

const PLAYER_W = 160;
const PLAYER_H = 240;

const PLAYER_X = SCREEN_W / 2;
const PLAYER_Y = SCREEN_H / 2;

let camX = 0, camY = 0;
let velX = 0, velY = 0;
let angle = 0, angVel = 0;
let prevAngle = 0;
let angleAccumulator = 0;

let fallStarted = false;
let betPlaced = false;
let betResolved = false;

// Physics Constants
// Physics Constants (modified dynamically by mode)
let GRAVITY = 0.55; // Base: 0.55
let MAX_FALL = 22;  // Base: 22

const AIR_FRICTION = 0.95;
const GROUND_FRICTION = 0.2;

// Spawn counts by mode
const TANK_COUNT_NORMAL = 20;
const TANK_COUNT_BONUS = 25;
const CAMP_COUNT_NORMAL = 10;
const CAMP_COUNT_BONUS = 15;

const VISIBILITY_BUFFER = 2200; // distance between 2

const tanks = [];
const camps = [];

// Ground trigger multipliers
const TANK_MULTIPLIER = 5;
const CAMP_MULTIPLIER = 50;

let activeTankIndex = 0;
let activeCampIndex = 0;


let inBlackHole = false;
let bhReturnX = 0;
let bhReturnY = 0;
let bhExitX = 0;
let bhExitY = 0;
let bhTargetMultiplier = 0;
let bhCurrentMultiplier = 1;
let bhStartTime = 0;
let originalSpriteBg = '';
let exitingAnimation = false;
let exitAnimStart = 0;

let tankTouched = false;

let bhAnimating = false;
let bhAnimEl = null;
let bhAnimStartTime = 0;
let bhAnimDuration = 1000;
let bhAnimStartSize = 150;
let bhAnimEndSize = 400;
let bhAnimType = 'enter';
let bhBgEl = null;
let bhMovingBgEl = null;
let bhRiseHeight = 0;
let bhBgOffsetY = 0;
let bhShowcaseStart = 0;

const voidSprites = [];

const VOID_BG_WIDTH = 2220;
const VOID_BG_HEIGHT = 6920;

const VOID_ZONE_X = 0;
const VOID_ZONE_Y = -VOID_BG_HEIGHT - 1000;
const VOID_START_Y = VOID_ZONE_Y + VOID_BG_HEIGHT - 1200;

const BH_RISE_SPEED = 7;



let earnings = 0;
let fallEarnings = 0;
let fallScorePaused = false;
let lastCamY = 0;
let lastUpdateTime = performance.now();
let landedTime = 0;
let originalEarnings = 0;
let finalEarnings = 0;
let showcaseScore = 0;

// Outcome tracking variables
let outcomeType = "lose";
let targetPayout = 0;
let zeroPayoutStartY = 0; // Track starting Y for zero payout early kill



const multiplierEl = document.getElementById("multiplier");
const flipTextEl = document.getElementById("flipText");

function showScore() {
  scoreEl.style.display = "block";
  scoreEl.textContent = `$${earnings.toFixed(2)}`;
}

function showMultiplier(m) {
  multiplierEl.textContent = `×${m.toFixed(2)}`;
  multiplierEl.style.display = "block";
}

function hideMultiplier() {
  multiplierEl.style.display = "none";
}

function showFlipText(text) {
  flipTextEl.textContent = text;
  flipTextEl.style.display = "block";
  setTimeout(() => {
    flipTextEl.style.display = "none";
  }, 500);
}

function lockBetUI() {
  plusBtn.disabled = true;
  minusBtn.disabled = true;
  betInput.disabled = true;
  betBtn.disabled = true;
  document.querySelectorAll(".chip").forEach(c => c.disabled = true);
}

function unlockBetUI() {
  plusBtn.disabled = false;
  minusBtn.disabled = false;
  betInput.disabled = false;
  betBtn.disabled = false;
  document.querySelectorAll(".chip").forEach(c => c.disabled = false);
}

function getEffectiveBet() {
  if (chaosMode) return 100;
  if (noZeroMode) return 50;
  if (bonusMode) return betAmount * 10;
  return betAmount;
}

function updateBalanceUI() {
  const formatted = balance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  balanceEl.textContent = `$${formatted}`;
  betInput.value = betAmount.toFixed(2);
  betBtn.disabled = getEffectiveBet() > balance || betAmount <= 0 || fallStarted;
}

plusBtn.onclick = () => {
  if (fallStarted) return;
  const sequence = [1, 2, 3, 4, 5, 10, 20, 30, 50, 100, 200];
  let nextBet = betAmount;
  for (let val of sequence) {
    if (val > betAmount && val <= balance) {
      nextBet = val;
      break;
    }
  }
  if (nextBet > betAmount) {
    betAmount = nextBet;
    updateBalanceUI();
  }
};

minusBtn.onclick = () => {
  if (fallStarted) return;
  betAmount = Math.max(10, betAmount - 10);
  updateBalanceUI();
};

betInput.oninput = () => {
  if (fallStarted) {
    betInput.value = betAmount.toFixed(2);
    return;
  }
  betAmount = Math.max(10, Math.min(balance, Number(betInput.value) || 10));
  betInput.value = betAmount.toFixed(2);
  updateBalanceUI();
};

document.querySelectorAll(".chip").forEach(c => {
  c.onclick = () => {
    if (fallStarted) return;
    const v = c.dataset.v;
    if (v === "max") betAmount = balance;
    else betAmount = Math.min(balance, betAmount + Number(v));
    updateBalanceUI();
  };
});

const soundBtn = document.getElementById("soundBtn");
let soundMuted = false;
soundBtn.onclick = () => {
  soundMuted = !soundMuted;

  if (soundMuted) {
    // Mute everything immediately
    backgroundMusic.volume = 0;
    if (planeSound) {
      planeSound.pause();
      planeSound = null;
      planeSoundPlaying = false;
    }
    soundBtn.textContent = "🔇";
  } else {
    // Unmute
    backgroundMusic.volume = 0.3;
    soundBtn.textContent = "🔊";
  }
};

let autoBetActive = false;
const autoBetBtn = document.getElementById("autoBetBtn");
autoBetBtn.onclick = () => {
  if (!autoBetActive) {
    // Show confirmation before enabling
    if (confirm("Enable Auto Play? This will automatically place entries until stopped.")) {
      autoBetActive = true;
      autoBetBtn.classList.add("active");
    }
  } else {
    autoBetActive = false;
    autoBetBtn.classList.remove("active");
  }
};

async function placeBetAction() {
  if (fallStarted || betPlaced) return;
  const effectiveBet = bonusMode ? betAmount * 10 : betAmount;
  if (effectiveBet > balance) {
    if (autoBetActive) {
      autoBetActive = false;
      autoBetBtn.classList.remove("active");
      alert("Insufficient balance for Auto Play");
    }
    return;
  }

  // If RGS URL is configured, validate connection before proceeding
  if (rgsUrl && !rgsConnected) {
    showRgsError(rgsUrl);
    return;
  }

  balance -= effectiveBet;
  updateBalanceUI();
  camX = camY = velX = velY = angle = angVel = 0;
  earnings = 0;
  lastCamY = 0;
  zeroPayoutStartY = camY; // Store starting Y for zero payout check
  fallStarted = true;
  betPlaced = true;
  betResolved = false;
  lockBetUI();

  // Determine outcome: use RGS server if configured, otherwise local math
  const outcomeOk = await decideOutcome(effectiveBet);
  if (!outcomeOk) {
    // RGS call failed mid-session — refund and show error
    balance += effectiveBet;
    fallStarted = false;
    betPlaced = false;
    unlockBetUI();
    updateBalanceUI();
    rgsConnected = false;
    showRgsError(rgsUrl);
    return;
  }

  // === PHYSICS TUNING ===
  // Normalize speed to feel like Base Mode
  if (noZeroMode) {
    // No-Zero has clouds + collisions -> Increase gravity/max speed to push through faster
    GRAVITY = 0.85;
    MAX_FALL = 26;
  } else if (chaosMode) {
    // Bonus/Chaos has NO clouds -> Reduction needed to match base feel
    GRAVITY = 0.45;
    MAX_FALL = 18;
  } else {
    // Base Mode Defaults
    GRAVITY = 0.55;
    MAX_FALL = 22;
  }
  // Hide bonus modal when bet is placed
  setBonusModalOpen(false);
}

betBtn.onclick = placeBetAction;

// Spacebar to bet
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat) {
    e.preventDefault(); // Prevent scrolling
    placeBetAction();
  }
});

async function decideOutcome(bet) {
  const actualBet = bet || betAmount;

  // Strict RGS Mode: If an RGS URL is configured, we must resolve via server.
  if (rgsUrl) {
    if (!rgsConnected) {
      console.error('RGS configured but not connected. Aborting outcome resolution.');
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${rgsUrl}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betAmount: actualBet,
          mode: chaosMode ? 'chaos' : noZeroMode ? 'noZero' : 'base'
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`);

      const data = await resp.json();
      targetPayout = data.targetPayout || 0;

      // Determine outcomeType from payout
      if (targetPayout <= 0) {
        outcomeType = 'lose';
      } else if (targetPayout >= actualBet * 50) {
        outcomeType = 'insane';
      } else if (targetPayout >= actualBet * 10) {
        outcomeType = 'big';
      } else if (targetPayout >= actualBet * 4) {
        outcomeType = 'medium';
      } else {
        outcomeType = 'small';
      }

      isZeroPayoutExplosion = (outcomeType === 'lose');
      console.log(`RGS Outcome: ${outcomeType}, targetPayout: ${targetPayout.toFixed(2)}, isZeroPayoutExplosion: ${isZeroPayoutExplosion}`);
      return true;
    } catch (e) {
      console.error('RGS bet request failed:', e.message);
      // Strictly NO fallback to local math if the RGS request fails
      return false;
    }
  }

  // Local math resolution (ONLY if no RGS URL provided at all)
  let math = BaseMath;
  if (chaosMode) math = BonusMath;
  else if (noZeroMode) math = NoZeroMath;

  let r = Math.random();
  let cumulative = 0;

  for (const tier of math.tiers) {
    cumulative += tier.probability;
    if (r < cumulative) {
      outcomeType = tier.name;
      targetPayout = actualBet * tier.multiplier;
      isZeroPayoutExplosion = (outcomeType === "lose");
      console.log(`Local Outcome: ${outcomeType}, targetPayout: ${targetPayout.toFixed(2)}, isZeroPayoutExplosion: ${isZeroPayoutExplosion}`);
      return true;
    }
  }

  // Fallback (should never reach here if probabilities sum to 1)
  outcomeType = "lose";
  targetPayout = 0;
  isZeroPayoutExplosion = true;
  console.log(`Outcome fallback: lose, targetPayout: 0, isZeroPayoutExplosion: true`);
  return true;
}


updateBalanceUI();

const bonusToggle = document.getElementById("bonusToggle");
const bonusModal = document.getElementById("bonusModal");

function setBonusModalOpen(open) {
  bonusModal.style.display = open ? "flex" : "none";
}

bonusToggle.onclick = () => {
  if (fallStarted) return;
  const isOpen = window.getComputedStyle(bonusModal).display !== "none";
  setBonusModalOpen(!isOpen);
  if (!isOpen) {
    updateBonusButtons();
  }
};

bonusModal.addEventListener("click", (e) => {
  // Click outside the modal-content closes the modal.
  if (e.target === bonusModal) setBonusModalOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (window.getComputedStyle(bonusModal).display === "none") return;
  setBonusModalOpen(false);
});

function setMode(nextMode) {
  if (fallStarted) return;

  const wasChaos = chaosMode;

  // Reset to defaults first
  bonusMode = false;
  noZeroMode = false;
  chaosMode = false;
  multiplierBet = 10;
  betAmount = 10;

  // If we were in chaos mode and are leaving it, rebuild the world back to normal.
  // (Chaos removes white clouds and spawns many pushables.)
  if (wasChaos && nextMode !== "chaos") {
    clearWorld();
    spawnWorld();
    spawnCollectibles(PRESET_SPAWN_COUNT);
  }

  if (nextMode === "noZero") {
    noZeroMode = true;
    betAmount = 50;
    bonusToggle.className = "bonus-btn no-zero";
    bonusToggle.textContent = "No-Zero";
  } else if (nextMode === "chaos") {
    chaosMode = true;
    betAmount = 100;

    // Apply chaos world effects immediately
    clouds.forEach(c => c.el.remove());
    clouds.length = 0;
    spawnPushables(1280);

    spawnTanks(TANK_COUNT_BONUS);
    spawnCamps(CAMP_COUNT_BONUS);

    bonusToggle.className = "bonus-btn chaos";
    bonusToggle.textContent = "Bonus";
  } else {
    bonusToggle.className = "bonus-btn";
    bonusToggle.textContent = "Bonus";
  }

  updateBonusButtons();
  updateBalanceUI();
}

function updateBonusButtons() {
  noZeroPayoutBtn.innerHTML = `
    <div class="bonus-title">No Zero Payout</div>
    <div class="bonus-image" style="background-image: url('items/No_0_background.png');"></div>
    <div class="bonus-description">Guaranteed minimum payout</div>
    <div class="bonus-amount">$50 entry</div>
    <button class="bonus-toggle-btn ${noZeroMode ? 'active' : ''}">${noZeroMode ? 'Deactivate' : 'Activate'}</button>
  `;

  chaosModeBtn.innerHTML = `
    <div class="bonus-title">Chaos Mode</div>
    <div class="bonus-image" style="background-image: url('items/satellite_background.png');"></div>
    <div class="bonus-description">Increased rewards and obstacles</div>
    <div class="bonus-amount">$100 entry</div>
    <button class="bonus-toggle-btn ${chaosMode ? 'active' : ''}">${chaosMode ? 'Deactivate' : 'Activate'}</button>
  `;
}

const noZeroPayoutBtn = document.getElementById("noZeroPayoutBtn");
noZeroPayoutBtn.onclick = () => {
  if (fallStarted) return;
  setMode(noZeroMode ? "default" : "noZero");
};

const chaosModeBtn = document.getElementById("chaosModeBtn");
chaosModeBtn.onclick = () => {
  if (fallStarted) return;
  setMode(chaosMode ? "default" : "chaos");
};

const runOverEl = document.getElementById("runOver");

function hardResetWorld(showLoss = true, delay = 2000) {
  fallStarted = false;
  betPlaced = false;
  betResolved = true;

  const payoutNum = earnings;
  balance += payoutNum;
  updateBalanceUI();

  if (showLoss) {
    runOverEl.innerHTML = `
      <div class="final-win-banner">
        <div class="banner-ribbon">FINAL WIN</div>
        <div class="banner-amount">$${payoutNum.toFixed(2)}</div>
      </div>
    `;
    runOverEl.style.display = "flex";
  }

  setTimeout(() => {
    clearWorld();
    camX = camY = velX = velY = angle = angVel = 0;
    earnings = 0;
    lastCamY = 0;
    runOverEl.style.display = "none";
    spawnWorld();
    spawnCollectibles(PRESET_SPAWN_COUNT);
    silverjetWrap.style.display = "block";

    // Reset explosion state and restore sprite
    explosionTriggered = false;
    sprite.style.display = "block";

    unlockBetUI();
    updateBalanceUI();

    // Auto Bet Trigger
    if (autoBetActive) {
      setTimeout(() => {
        if (autoBetActive && !fallStarted) {
          placeBetAction();
        }
      }, 500);
    }

  }, delay);
}

function clearWorld() {
  [...collectibles, ...chains, ...notes].forEach(c => c.el.remove());
  collectibles.length = chains.length = notes.length = 0;
  for (const c of clouds) c.el.remove();
  clouds.length = 0;
  for (const c of darkClouds) c.el.remove();
  darkClouds.length = 0;
  blackHoles.forEach(bh => bh.el.remove());
  blackHoles.length = 0;
  pushables.forEach(p => p.el.remove());
  pushables.length = 0;
}

const collectibles = [];
const chains = [];
const notes = [];
const blackHoles = [];
const blackholequantity = 20;
let tank = null;
let camp = null;
const pushables = [];


const silverjetWrap = document.createElement("div");
silverjetWrap.style.position = "absolute";
silverjetWrap.style.pointerEvents = "none";
silverjetWrap.style.zIndex = "100000";

const silverjet = document.createElement("div");
silverjet.className = "silverjet";
silverjetWrap.appendChild(silverjet);
world.appendChild(silverjetWrap);


function spawnCollectibles(count = PRESET_SPAWN_COUNT) {
  [...collectibles, ...chains, ...notes].forEach(c => c.el.remove());
  collectibles.length = chains.length = notes.length = 0;

  const TOP_SAFE = DEADZONE;
  const BOTTOM_SAFE_START = GROUND_Y - DEADZONE;

  const actualCount = bonusMode || chaosMode ? count * 2 : count; // Increase satellites in bonus or chaos mode

  for (let i = 0; i < actualCount; i++) {
    const type = Math.random();
    const el = document.createElement("div");
    let value = 0, arr;

    if (type < 0.4) {
      el.className = "collectible chain";
      value = 1.5; // Reduced from 3 to balance earnings
      arr = chains;
    } else {
      el.className = "collectible music";
      value = 2.5; // Reduced from 5 to balance earnings
      arr = notes;
    }

    const x = (Math.random() * SCREEN_W * 10) - (SCREEN_W * 5);

    let y;
    do {
      y = Math.random() * WORLDH;
    } while (y < TOP_SAFE || y > BOTTOM_SAFE_START);

    el.style.left = (x - 85) + "px";
    el.style.top = (y - 85) + "px";

    world.appendChild(el);
    const obj = { x, y, value, el };
    arr.push(obj);
    collectibles.push(obj);
  }
}



// ========= BLACK HOLES =========

function spawnBlackHoles(count = blackholequantity) {
  blackHoles.forEach(bh => bh.el.remove());
  blackHoles.length = 0;

  const TOP_SAFE = DEADZONE;
  const BOTTOM_SAFE = GROUND_Y - DEADZONE - BH_SIZE;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "black-hole";
    el.style.width = BH_SIZE + "px";
    el.style.height = BH_SIZE + "px";
    el.style.background = `url('items/black_hole_1.png') no-repeat center/contain`;

    const x = randX();
    const y = TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);

    el.style.left = x + "px";
    el.style.top = y + "px";

    world.appendChild(el);
    blackHoles.push({ x, y, el, rotation: 0 });
  }
}

// ========= TANKS =========

function spawnTanks(count = TANK_COUNT_NORMAL) {
  tanks.forEach(t => t.el.remove());
  tanks.length = 0;

  const groundY = parseInt(ground.style.top);

  // Even spacing so the player encounters them reliably.
  const MIN_X = -SCREEN_W * 20;
  const MAX_X = SCREEN_W * 20;
  const step = count > 1 ? (MAX_X - MIN_X) / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "tank";
    el.style.width = "500px";
    el.style.height = "375px";
    el.style.background = "url('items/tank.png') no-repeat center/contain";
    el.style.display = "none";

    const x = MIN_X + step * i;
    const y = groundY + 150;

    el.style.left = x + "px";
    el.style.top = y + "px";

    world.appendChild(el);
    tanks.push({ x, y, el, active: false });
  }
}


// ========= MILITARY CAMP =========

function spawnCamps(count = CAMP_COUNT_NORMAL) {
  camps.forEach(c => c.el.remove());
  camps.length = 0;

  const groundY = parseInt(ground.style.top);

  // Even spacing, separate from tanks.
  const MIN_X = -SCREEN_W * 15;
  const MAX_X = SCREEN_W * 15;
  const step = count > 1 ? (MAX_X - MIN_X) / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "military-camp";
    el.style.width = "800px";
    el.style.height = "600px";
    el.style.background = "url('items/camp.png') no-repeat center/contain";
    el.style.display = "none";

    const x = MIN_X + step * (i + 0.5);
    const y = groundY;

    el.style.left = x + "px";
    el.style.top = y + "px";

    world.appendChild(el);
    camps.push({ x, y, el, active: false });
  }
}


function updateGroundEntitiesVisibility() {
  const camBottom = camY + SCREEN_H;

  // Visibility update only - collision handled in resolveCollisions
  // ---- TANK ----
  tanks.forEach(t => {
    const dy = Math.abs(t.y - camBottom);
    const visible = dy < VISIBILITY_BUFFER;
    const value = visible ? "block" : "none";
    if (t.el.style.display !== value) {
      t.el.style.display = value;
    }
  });

  // ---- CAMP ----
  camps.forEach(c => {
    const dy = Math.abs(c.y - camBottom);
    const visible = dy < VISIBILITY_BUFFER;
    const value = visible ? "block" : "none";
    if (c.el.style.display !== value) {
      c.el.style.display = value;
    }
  });
}


// ========= PUSHABLES =========

function spawnPushables(count = pushablequantity) {
  pushables.forEach(p => p.el.remove());
  pushables.length = 0;

  const TOP_SAFE = DEADZONE;
  const BOTTOM_SAFE = GROUND_Y - DEADZONE - 80;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "pushable";
    el.style.width = "550px";
    el.style.height = "550px";
    el.style.background = "url('items/pushable.png') no-repeat center/contain";

    const x = randX();
    const y = TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);

    el.style.left = x + "px";
    el.style.top = y + "px";

    world.appendChild(el);
    pushables.push({ x, y, el, velX: 0, velY: 0 });
  }
}



// ========= STARFIELD =========

const starfield = document.getElementById("starfield");
const STAR_COUNT = 180;
for (let i = 0; i < STAR_COUNT; i++) {
  const star = document.createElement("div");
  star.className = "star";
  star.style.left = Math.random() * 100 + "vw";
  star.style.top = Math.random() * 100 + "vh";
  star.style.animationDuration = (Math.random() * 2 + 1) + "s";
  star.style.animationDelay = Math.random() * 2 + "s";
  starfield.appendChild(star);
}

// ========= ANIMATED DECOR CLOUDS =========
let CLOUD_ACTIVE_MIN = 0;
let CLOUD_ACTIVE_MAX = 200;
let playerY = 0;

const animated_clouds = [];
let animated_clouds_lastTime = performance.now();

function createAnimatedCloud(layer, count, speedMin, speedMax, yMin, yMax, sizeScale) {
  const container = document.querySelector(layer);
  if (!container) return;

  for (let i = 0; i < count; i++) {
    const cloud = document.createElement("div");

    const scale = (0.7 + Math.random() * 0.6) * sizeScale;
    const y = Math.random() * (yMax - yMin) + yMin;
    // Use the game coordinate space so the decor scales with #game-scale.
    const x = Math.random() * SCREEN_W + 600;
    const speed = speedMin + Math.random() * (speedMax - speedMin);

    cloud.style.position = "absolute";
    cloud.style.top = y + "px";
    cloud.style.transform = `translate3d(${x}px, 0, 0) scale(${scale})`;

    container.appendChild(cloud);

    animated_clouds.push({
      el: cloud,
      x,
      y,
      speed,
      yMin,
      yMax,
      scale
    });
  }
}

createAnimatedCloud(".back", 12, 200, 450, 0, 850, 0.8);
createAnimatedCloud(".mid", 8, 450, 600, 0, 1050, 0.9);
createAnimatedCloud(".front", 6, 700, 1000, 0, 1200, 1.3);

function animateAnimatedClouds(now) {
  const dt = (now - animated_clouds_lastTime) / 1000;
  animated_clouds_lastTime = now;

  animated_clouds.forEach(c => {
    c.x += c.speed * dt;

    if (c.x > SCREEN_W + 300) {
      c.x = -300;
      c.y = Math.random() * (c.yMax - c.yMin) + c.yMin;
      c.el.style.top = c.y + "px";
    }

    c.el.style.transform = `translate3d(${c.x}px, 0, 0) scale(${c.scale})`;
  });

  requestAnimationFrame(animateAnimatedClouds);
}

requestAnimationFrame(animateAnimatedClouds);

// ========= CLOUDS =========

const clouds = [];
const CLOUD1_W = 320 * 1.7, CLOUD1_H = 160 * 1.7;
const CLOUD2_W = 325 * 1.5, CLOUD2_H = 217 * 1.5;

const CLOUD1 = [
  { x: 0.1329, y: 0.6750, r: 0.0922 },
  { x: 0.2251, y: 0.5125, r: 0.1094 },
  { x: 0.2689, y: 0.6750, r: 0.0594 },
  { x: 0.3986, y: 0.3781, r: 0.1266 },
  { x: 0.3830, y: 0.7219, r: 0.0797 },
  { x: 0.5189, y: 0.7219, r: 0.0750 },
  { x: 0.6237, y: 0.5312, r: 0.1141 },
  { x: 0.7331, y: 0.7031, r: 0.0891 },
  { x: 0.7862, y: 0.5844, r: 0.0610 },
  { x: 0.8581, y: 0.6531, r: 0.0703 }
];

const CLOUD2 = [
  { x: 0.1508, y: 0.7857, r: 0.0892 },
  { x: 0.2169, y: 0.6912, r: 0.0692 },
  { x: 0.3646, y: 0.5622, r: 0.1308 },
  { x: 0.2338, y: 0.7926, r: 0.0862 },
  { x: 0.3862, y: 0.8641, r: 0.0877 },
  { x: 0.5277, y: 0.6336, r: 0.0477 },
  { x: 0.5138, y: 0.8433, r: 0.0738 },
  { x: 0.6385, y: 0.6935, r: 0.1092 },
  { x: 0.6062, y: 0.8525, r: 0.0462 },
  { x: 0.7108, y: 0.8088, r: 0.1015 }
];

function randX() {
  return (Math.random() * SCREEN_W * 10) - (SCREEN_W * 5);
}

function spawnY() {
  const MAX_CLOUD_H = Math.max(CLOUD1_H, CLOUD2_H);
  const TOP_SAFE = DEADZONE;
  const BOTTOM_SAFE = GROUND_Y - DEADZONE - MAX_CLOUD_H;
  return TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);
}


function spawnCloud(x, y) {
  const pick = Math.random() < 0.5 ? 1 : 2;
  let el = document.createElement("div");
  el.className = "cloud";

  // Remove randomness, use original size
  const scale = 1.0;

  let circles;
  let W, H, base;

  if (pick === 1) {
    W = CLOUD1_W * scale;
    H = CLOUD1_H * scale;
    base = CLOUD1;

    el.style.width = W + "px";
    el.style.height = H + "px";
    el.style.background = `url('clouds/cloud4.png') no-repeat center/contain`;

    circles = base.map(c => ({
      x: x + c.x * W,
      y: y + c.y * H,
      r: c.r * W
    }));

  } else {
    W = CLOUD2_W * scale;
    H = CLOUD2_H * scale;
    base = CLOUD2;

    el.style.width = W + "px";
    el.style.height = H + "px";
    el.style.background = `url('clouds/cloud2.png') no-repeat center/contain`;

    circles = base.map(c => ({
      x: x + c.x * W,
      y: y + c.y * H,
      r: c.r * W
    }));
  }

  el.style.left = x + "px";
  el.style.top = y + "px";

  world.appendChild(el);
  clouds.push({ x, y, el, circles });
}


// ========= DARK CLOUDS =========

const darkClouds = [];
const DARK_W = 280 * 1.5;
const DARK_H = 187 * 1.5;

const DARK_RECTS = [
  { w: 0.1892857, h: 0.0855615, x: 0.4178571, y: 0.1925134 },
  { w: 0.4321429, h: 0.1176471, x: 0.2964286, y: 0.2780749 },
  { w: 0.5857143, h: 0.0802139, x: 0.2071429, y: 0.3957219 },
  { w: 0.7714286, h: 0.2139037, x: 0.1250000, y: 0.4759358 }
];

var grabbedByDarkCloud = false;
let releaseTime = 0;
let grabbedCloud = null;
let freezeX = 0, freezeY = 0;

const skeleton = document.getElementById("skeleton");
const sprite = document.getElementById("sprite");
sprite.style.backgroundImage = "url('items/game sprite green.png')";
let skeletonFlashInterval = null;

function spawnDarkCloud(x, y) {
  if (y > GROUND_Y - 500) return;
  const el = document.createElement("div");
  el.className = "dark-cloud";
  el.style.width = DARK_W + "px";
  el.style.height = DARK_H + "px";
  el.style.left = x + "px";
  el.style.top = y + "px";

  world.appendChild(el);

  const rects = DARK_RECTS.map(r => ({
    x: x + r.x * DARK_W,
    y: y + r.y * DARK_H,
    w: r.w * DARK_W,
    h: r.h * DARK_H
  }));

  darkClouds.push({ x, y, el, rects });
}

function spawnWorld() {
  if (!bonusMode && !chaosMode) {
    for (let i = 0; i < cloudquantity; i++) spawnCloud(randX(), spawnY());
  }
  for (let i = 0; i < darkcloudquantity; i++) spawnDarkCloud(randX(), spawnY());
  spawnBlackHoles(blackholequantity);
  spawnTanks(chaosMode ? TANK_COUNT_BONUS : TANK_COUNT_NORMAL);
  spawnCamps(chaosMode ? CAMP_COUNT_BONUS : CAMP_COUNT_NORMAL);

  const pushableQty = chaosMode ? 1280 : 16; // Reduced by 20% for performance
  spawnPushables(pushableQty);
}
spawnWorld();
spawnCollectibles(PRESET_SPAWN_COUNT);

// ========= PLAYER COLLIDERS =========

const ELLIPSES = [
  { x: 0.2357, y: 0.0190, w: 0.4357, h: 0.4048 }
];

const RECTS = [
  { x: 0.1071, y: 0.3905, w: 0.6857, h: 0.3476 },
  { x: 0.2214, y: 0.7333, w: 0.4571, h: 0.2381 }
];

function getPlayerColliders() {
  const list = [];

  const centerX = camX + PLAYER_X;
  const centerY = camY + PLAYER_Y;

  function rotatePoint(x, y) {
    const dx = x - centerX;
    const dy = y - centerY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos
    };
  }

  for (const e of ELLIPSES) {
    const w = e.w * PLAYER_W;
    const h = e.h * PLAYER_H;
    const r = Math.min(w, h) / 2;
    const ex = ((e.x + e.w / 2) - 0.5) * PLAYER_W;
    const ey = ((e.y + e.h / 2) - 0.5) * PLAYER_H;
    const rot = rotatePoint(centerX + ex, centerY + ey);
    list.push({ x: rot.x, y: rot.y, r });
  }

  for (const rct of RECTS) {
    const w = rct.w * PLAYER_W;
    const h = rct.h * PLAYER_H;
    const r = Math.min(w, h) / 2;
    const rx = ((rct.x + rct.w / 2) - 0.5) * PLAYER_W;
    const ry = ((rct.y + rct.h / 2) - 0.5) * PLAYER_H;
    const rot = rotatePoint(centerX + rx, centerY + ry);
    list.push({ x: rot.x, y: rot.y, r });
  }

  return list;
}

// ========= DEBUG COLLIDERS =========

const debugCanvas = document.getElementById("debugColliders");
const dctx = debugCanvas.getContext("2d");
debugCanvas.width = SCREEN_W;
debugCanvas.height = SCREEN_H;

function drawDebugColliders() {
  dctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  const cols = getPlayerColliders();
  cols.forEach(c => {
    dctx.beginPath();
    dctx.arc(c.x - camX, c.y - camY, c.r, 0, Math.PI * 2);
    dctx.strokeStyle = "rgba(255,200,0,0.9)";
    dctx.lineWidth = 3;
    dctx.stroke();

    dctx.beginPath();
    dctx.arc(c.x - camX, c.y - camY, 2, 0, Math.PI * 2);
    dctx.fillStyle = "red";
    dctx.fill();
  });

  // Draw black hole colliders
  blackHoles.forEach(bh => {
    const bx = bh.x + BH_SIZE / 2;
    const by = bh.y + BH_SIZE / 2;
    dctx.beginPath();
    dctx.arc(bx - camX, by - camY, BH_RADIUS, 0, Math.PI * 2);
    dctx.strokeStyle = "rgba(0,255,0,0.9)"; // Green for black holes
    dctx.lineWidth = 2;
    dctx.stroke();

    dctx.beginPath();
    dctx.arc(bx - camX, by - camY, 2, 0, Math.PI * 2);
    dctx.fillStyle = "green";
    dctx.fill();
  });

  // Draw collectible colliders
  collectibles.forEach(c => {
    dctx.beginPath();
    dctx.arc(c.x - camX, c.y - camY, 85, 0, Math.PI * 2);
    dctx.strokeStyle = "rgba(255,0,255,0.9)"; // Magenta for collectibles
    dctx.lineWidth = 2;
    dctx.stroke();

    dctx.beginPath();
    dctx.arc(c.x - camX, c.y - camY, 2, 0, Math.PI * 2);
    dctx.fillStyle = "magenta";
    dctx.fill();
  });

  // Draw pushable colliders
  pushables.forEach(p => {
    dctx.beginPath();
    dctx.arc(p.x + 275 - camX, p.y + 275 - camY, 150, 0, Math.PI * 2);
    dctx.strokeStyle = "rgba(0,255,255,0.9)"; // Cyan for pushables
    dctx.lineWidth = 2;
    dctx.stroke();

    dctx.beginPath();
    dctx.arc(p.x + 275 - camX, p.y + 275 - camY, 2, 0, Math.PI * 2);
    dctx.fillStyle = "cyan";
    dctx.fill();
  });
}

// ========= PHYSICS =========

const MASS = 2.0;

function restitutionFromSpeed(v) {
  const s = Math.min(Math.abs(v), 40);
  if (s < 1) return 0;
  if (s < 8) return 0.1;
  if (s < 14) return 0.3;
  if (s < 22) return 0.5;
  if (s < 30) return 0.6;
  return 0.5;
}

function recycleClouds() {
  const MAX_CLOUD_H = Math.max(CLOUD1_H, CLOUD2_H);

  const TOP_LIMIT = DEADZONE;
  const BOTTOM_LIMIT = GROUND_Y - DEADZONE - MAX_CLOUD_H;

  for (let c of clouds) {

    if (c.y < TOP_LIMIT - REUSE_DISTANCE) {
      c.y = BOTTOM_LIMIT - Math.random() * 1200;
      c.x = randX();
      c.el.style.left = c.x + "px";
      c.el.style.top = c.y + "px";

      const pick1 = c.el.style.background.includes("cloud4");
      const base = pick1 ? CLOUD1 : CLOUD2;
      const W = pick1 ? CLOUD1_W : CLOUD2_W;
      const H = pick1 ? CLOUD1_H : CLOUD2_H;

      c.circles = base.map(p => ({
        x: c.x + p.x * W,
        y: c.y + p.y * H,
        r: p.r * W
      }));
    }

    else if (c.y > BOTTOM_LIMIT + REUSE_DISTANCE) {
      c.y = TOP_LIMIT + Math.random() * 1200;
      c.x = randX();
      c.el.style.left = c.x + "px";
      c.el.style.top = c.y + "px";

      const pick1 = c.el.style.background.includes("cloud4");
      const base = pick1 ? CLOUD1 : CLOUD2;
      const W = pick1 ? CLOUD1_W : CLOUD2_W;
      const H = pick1 ? CLOUD1_H : CLOUD2_H;

      c.circles = base.map(p => ({
        x: c.x + p.x * W,
        y: c.y + p.y * H,
        r: p.r * W
      }));
    }
  }
}



function recycleDarkClouds() {
  const MAX_CLOUD_H = DARK_H;

  const TOP_LIMIT = DEADZONE;
  const BOTTOM_LIMIT = GROUND_Y - DEADZONE - MAX_CLOUD_H;

  for (let c of darkClouds) {

    if (c.y < TOP_LIMIT - REUSE_DISTANCE) {
      c.y = BOTTOM_LIMIT - Math.random() * 1200;
      c.x = randX();
      c.el.style.left = c.x + "px";
      c.el.style.top = c.y + "px";

      c.rects = DARK_RECTS.map(r => ({
        x: c.x + r.x * DARK_W,
        y: c.y + r.y * DARK_H,
        w: r.w * DARK_W,
        h: r.h * DARK_H
      }));
    }

    else if (c.y > BOTTOM_LIMIT + REUSE_DISTANCE) {
      c.y = TOP_LIMIT + Math.random() * 1200;
      c.x = randX();
      c.el.style.left = c.x + "px";
      c.el.style.top = c.y + "px";

      c.rects = DARK_RECTS.map(r => ({
        x: c.x + r.x * DARK_W,
        y: c.y + r.y * DARK_H,
        w: r.w * DARK_W,
        h: r.h * DARK_H
      }));
    }
  }
}

function recycleBlackHoles() {
  const MAX_H = BH_SIZE; // Black hole height

  const TOP_LIMIT = DEADZONE;
  const BOTTOM_LIMIT = GROUND_Y - DEADZONE - MAX_H;

  for (let bh of blackHoles) {

    if (bh.y < TOP_LIMIT - REUSE_DISTANCE) {
      bh.y = TOP_LIMIT + Math.random() * (BOTTOM_LIMIT - TOP_LIMIT);
      bh.x = randX();
      bh.rotation = 0;
      bh.el.style.transform = '';
      bh.el.style.left = bh.x + "px";
      bh.el.style.top = bh.y + "px";
    }

    else if (bh.y > BOTTOM_LIMIT + REUSE_DISTANCE) {
      bh.y = TOP_LIMIT + Math.random() * (BOTTOM_LIMIT - TOP_LIMIT);
      bh.x = randX();
      bh.rotation = 0;
      bh.el.style.transform = '';
      bh.el.style.left = bh.x + "px";
      bh.el.style.top = bh.y + "px";
    }
  }
}

function recyclePushables() {
  const MAX_H = 550; // Pushable height

  const TOP_LIMIT = DEADZONE;
  const BOTTOM_LIMIT = GROUND_Y - DEADZONE - MAX_H;

  for (let p of pushables) {

    if (p.y < TOP_LIMIT - REUSE_DISTANCE) {
      p.y = BOTTOM_LIMIT - Math.random() * 1200;
      p.x = randX();
      p.velX = 0;
      p.velY = 0;
      p.el.style.left = p.x + "px";
      p.el.style.top = p.y + "px";
    }

    else if (p.y > BOTTOM_LIMIT + REUSE_DISTANCE) {
      p.y = TOP_LIMIT + Math.random() * 1200;
      p.x = randX();
      p.velX = 0;
      p.velY = 0;
      p.el.style.left = p.x + "px";
      p.el.style.top = p.y + "px";
    }
  }
}



function resolveCollisions() {
  let onGround = false;

  const muKinetic = 0.08;
  const r = PLAYER_W * 0.45;
  const I = 2.5 * r * r;

  const PLAYER_COLLIDERS = getPlayerColliders();
  const bodyCX = camX + PLAYER_X;
  const bodyCY = camY + PLAYER_Y;

  const contacts = [];

  // Skip cloud collisions entirely for zero payout - fall straight through
  if (!isZeroPayoutExplosion) {
    for (const cloud of clouds) {

      if (Math.abs(cloud.y - (camY + PLAYER_Y)) > 900)
        continue;

      for (const c of cloud.circles) {
        const cx = c.x;
        const cy = c.y;
        const cr = c.r;

        for (const p of PLAYER_COLLIDERS) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const distSq = dx * dx + dy * dy;
          const minDist = p.r + cr;
          if (distSq >= minDist * minDist) continue;

          const dist = Math.sqrt(distSq) || 0.00001;
          const nx = dx / dist;
          const ny = dy / dist;

          contacts.push({
            nx,
            ny,
            penetration: (minDist - dist),
            px: p.x,
            py: p.y
          });
        }
      }
    }
  } // End of cloud collision skip for zero payout



  if (contacts.length > 0) {
    let nx = 0, ny = 0, depth = 0;

    for (const c of contacts) {
      nx += c.nx;
      ny += c.ny;
      depth += c.penetration;
    }

    nx /= contacts.length;
    ny /= contacts.length;
    depth /= contacts.length;

    const len = Math.hypot(nx, ny) || 0.00001;
    nx /= len;
    ny /= len;

    const ref = contacts[0];
    const px = ref.px;
    const py = ref.py;

    const rx = px - bodyCX;
    const ry = py - bodyCY;

    const relVX = velX - (-angVel * ry);
    const relVY = velY + (angVel * rx);

    const relNormal = relVX * nx + relVY * ny;

    if (relNormal < 0) {
      const speed = Math.hypot(relVX, relVY);
      const e = restitutionFromSpeed(speed);

      const rCrossN = rx * ny - ry * nx;
      const denom = (1 / MASS) + (rCrossN * rCrossN) / I;

      const j = -(1 + e) * relNormal / denom;

      velX += (j * nx) / MASS;
      velY += (j * ny) / MASS;
      angVel += (rCrossN * j) / I;

      const vtX = relVX - relNormal * nx;
      const vtY = relVY - relNormal * ny;
      const vt = Math.hypot(vtX, vtY);

      if (vt > 0.0001) {
        const tx = vtX / vt;
        const ty = vtY / vt;

        let jt = -vt / denom;
        const maxFriction = muKinetic * Math.abs(j);
        jt = Math.max(-maxFriction, Math.min(maxFriction, jt));

        velX += (jt * tx) / MASS;
        velY += (jt * ty) / MASS;
        angVel += (rCrossN * jt) / I;
      }
    }

    const MAX_SPIN = 0.05;
    angVel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, angVel));

    const k_slop = 1.5;
    const percent = 0.45;
    const corr = Math.max(depth - k_slop, 0) * percent;
    const MAX_CORR = 8;
    const finalCorr = Math.min(corr, MAX_CORR);

    camX += nx * finalCorr;
    camY += ny * finalCorr;
  }

  for (const cloud of darkClouds) {
    for (const rect of cloud.rects) {
      for (const p of PLAYER_COLLIDERS) {
        const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
        const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
        const dx = p.x - nearestX;
        const dy = p.y - nearestY;

        if (dx * dx + dy * dy < p.r * p.r && !grabbedByDarkCloud) {
          grabbedByDarkCloud = true;
          releaseTime = performance.now() + 1500;
          grabbedCloud = cloud;

          freezeX = camX;
          freezeY = camY;
          velX = velY = 0;
          angVel = 0;

          earnings *= 0.5;

          playSound('items/lightning_sound.mp3', 0.8);

          skeleton.style.display = "block";
          sprite.style.display = "block";

          let showSkeleton = false;
          skeletonFlashInterval = setInterval(() => {
            showSkeleton = !showSkeleton;
            skeleton.style.display = showSkeleton ? "block" : "none";
            sprite.style.display = showSkeleton ? "none" : "block";
          }, 90);

          return false;
        }
      }
    }
  }

  // Skip black hole entry for zero payout - don't let player get multipliers
  if (!isZeroPayoutExplosion) {
    for (const bh of blackHoles) {
      const bx = bh.x + BH_SIZE / 2;
      const by = bh.y + BH_SIZE / 2;

      for (const p of PLAYER_COLLIDERS) {
        const dx = p.x - bx;
        const dy = p.y - by;

        if (dx * dx + dy * dy < (BH_RADIUS + p.r) ** 2) {
          enterBlackHole(bh);
          return false;
        }
      }
    }
  }

  // Handle TANK collisions (iterate all visible/nearby tanks)
  const TANK_W = 500;
  const TANK_H = 375;
  for (let i = tanks.length - 1; i >= 0; i--) {
    const t = tanks[i];
    // Check if near player vertically
    if (Math.abs(t.y - (camY + SCREEN_H)) > 2000) continue;

    const rect = { x: t.x, y: t.y, w: TANK_W, h: TANK_H };
    let collided = false;

    // Use a slightly more generous hit check for ground entities
    const HIT_PADDING = 30;

    for (const p of PLAYER_COLLIDERS) {
      const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
      const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
      const dx = p.x - nearestX;
      const dy = p.y - nearestY;

      // Expand hit radius slightly for easier collection
      if (dx * dx + dy * dy < (p.r + HIT_PADDING) ** 2) {
        collided = true;
        break;
      }
    }

    if (collided) {
      // Apply collision response: separate player from tank
      const playerCenterX = camX + PLAYER_X;
      const playerCenterY = camY + PLAYER_Y;
      const tankCenterX = rect.x + rect.w / 2;
      const tankCenterY = rect.y + rect.h / 2;

      const dx = playerCenterX - tankCenterX;
      const dy = playerCenterY - tankCenterY;
      const dist = Math.hypot(dx, dy) || 0.00001;
      const nx = dx / dist;
      const ny = dy / dist;

      // Calculate penetration
      const playerRadius = PLAYER_W * 0.45;
      const tankRadius = Math.hypot(rect.w / 2, rect.h / 2);
      const penetration = playerRadius + tankRadius - dist;

      if (penetration > 0) {
        // Separate player
        camX += nx * penetration * 0.2; // Softer separation
        camY += ny * penetration * 0.2;

        // Apply some bounce
        const speed = Math.hypot(velX, velY);
        const e = restitutionFromSpeed(speed);
        velX += nx * speed * e * 0.5;
        velY += ny * speed * e * 0.5;
      }

      // Trigger multiplier
      earnings = Math.min(earnings * TANK_MULTIPLIER, targetPayout);
      showMultiplier(TANK_MULTIPLIER);

      t.el.remove();
      tanks.splice(i, 1); // Remove from logic array

      setTimeout(hideMultiplier, 1200);
    }
  }

  // Handle CAMP collisions
  const CAMP_W = 800;
  const CAMP_H = 600;

  for (let i = camps.length - 1; i >= 0; i--) {
    const c = camps[i];
    if (Math.abs(c.y - (camY + SCREEN_H)) > 2000) continue;

    const rect = { x: c.x, y: c.y, w: CAMP_W, h: CAMP_H };
    let collided = false;
    const HIT_PADDING = 30;

    for (const p of PLAYER_COLLIDERS) {
      const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
      const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
      const dx = p.x - nearestX;
      const dy = p.y - nearestY;

      if (dx * dx + dy * dy < (p.r + HIT_PADDING) ** 2) {
        collided = true;
        break;
      }
    }

    if (collided) {
      // Apply collision response: separate player from camp
      const playerCenterX = camX + PLAYER_X;
      const playerCenterY = camY + PLAYER_Y;
      const campCenterX = rect.x + rect.w / 2;
      const campCenterY = rect.y + rect.h / 2;

      const dx = playerCenterX - campCenterX;
      const dy = playerCenterY - campCenterY;
      const dist = Math.hypot(dx, dy) || 0.00001;
      const nx = dx / dist;
      const ny = dy / dist;

      // Calculate penetration
      const playerRadius = PLAYER_W * 0.45;
      const campRadius = Math.hypot(rect.w / 2, rect.h / 2);
      const penetration = playerRadius + campRadius - dist;

      if (penetration > 0) {
        // Separate player
        camX += nx * penetration * 0.2;
        camY += ny * penetration * 0.2;

        // Apply some bounce
        const speed = Math.hypot(velX, velY);
        const e = restitutionFromSpeed(speed);
        velX += nx * speed * e * 0.5;
        velY += ny * speed * e * 0.5;
      }

      // Trigger multiplier - camp is 50x!
      earnings = Math.min(earnings * CAMP_MULTIPLIER, targetPayout);
      showMultiplier(CAMP_MULTIPLIER);

      c.el.remove();
      camps.splice(i, 1);

      setTimeout(hideMultiplier, 1200);
    }
  }


  let lowest = -Infinity;
  for (const p of PLAYER_COLLIDERS) {
    const bottom = p.y + p.r;
    if (bottom > lowest) lowest = bottom;
  }

  const playerBottom = lowest;

  if (playerBottom >= GROUND_Y && !inBlackHole) {
    const penetration = playerBottom - GROUND_Y;
    camY -= penetration;

    const speed = Math.hypot(velX, velY);
    const e = restitutionFromSpeed(speed);

    if (speed > 0.4) {
      velY = -Math.abs(velY) * e;
      velY *= 0.65;

      const MAX_BOUNCE = 14;
      if (Math.abs(velY) > MAX_BOUNCE) velY = -MAX_BOUNCE;

      angVel *= 0.85;
    } else {
      velX *= 0.85;
      velY = 0;
      angVel *= 0.6;
      onGround = true;
    }
  }

  // Handle pushable collisions
  for (const p of pushables) {
    const px = p.x + 275;
    const py = p.y + 275;
    const pr = 150;

    // Optimization: Skip pushables that are too far from the player
    const playerX = camX + PLAYER_X;
    const playerY = camY + PLAYER_Y;
    const dxToPlayer = px - playerX;
    const dyToPlayer = py - playerY;
    const distToPlayerSq = dxToPlayer * dxToPlayer + dyToPlayer * dyToPlayer;
    const maxDist = 1000; // Only check pushables within 1000 pixels
    if (distToPlayerSq > maxDist * maxDist) continue;

    const contacts = [];

    for (const pc of PLAYER_COLLIDERS) {
      const dx = pc.x - px;
      const dy = pc.y - py;
      const distSq = dx * dx + dy * dy;
      const minDist = pc.r + pr;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq) || 0.00001;
      const nx = dx / dist;
      const ny = dy / dist;
      const penetration = minDist - dist;

      contacts.push({
        nx,
        ny,
        penetration,
        px: pc.x,
        py: pc.y
      });
    }

    if (contacts.length > 0) {
      let nx = 0, ny = 0, depth = 0;

      for (const c of contacts) {
        nx += c.nx;
        ny += c.ny;
        depth += c.penetration;
      }

      nx /= contacts.length;
      ny /= contacts.length;
      depth /= contacts.length;

      const len = Math.hypot(nx, ny) || 0.00001;
      nx /= len;
      ny /= len;

      const ref = contacts[0];
      const px = ref.px;
      const py = ref.py;

      const rx = px - bodyCX;
      const ry = py - bodyCY;

      const relVX = velX - (-angVel * ry);
      const relVY = velY + (angVel * rx);

      const relNormal = relVX * nx + relVY * ny;

      if (relNormal < 0) {
        const speed = Math.hypot(relVX, relVY);
        const e = restitutionFromSpeed(speed);

        const rCrossN = rx * ny - ry * nx;
        const denom = (1 / MASS) + (rCrossN * rCrossN) / I;

        const j = -(1 + e) * relNormal / denom;

        velX += (j * nx) / MASS;
        velY += (j * ny) / MASS;
        angVel += (rCrossN * j) / I;

        const vtX = relVX - relNormal * nx;
        const vtY = relVY - relNormal * ny;
        const vt = Math.hypot(vtX, vtY);

        if (vt > 0.0001) {
          const tx = vtX / vt;
          const ty = vtY / vt;

          let jt = -vt / denom;
          const maxFriction = muKinetic * Math.abs(j);
          jt = Math.max(-maxFriction, Math.min(maxFriction, jt));

          velX += (jt * tx) / MASS;
          velY += (jt * ty) / MASS;
          angVel += (rCrossN * jt) / I;
        }
      }

      // Apply force to pushable with reduced movement to simulate mass
      // Push force increased by 15% for easier pushing
      const pushForce = 2.3;
      p.velX += -nx * pushForce * 0.5;
      p.velY += -ny * pushForce * 0.5;

      // Apply stronger reaction force to player in opposite direction for resistance feel
      velX += nx * pushForce * 0.8;
      velY += ny * pushForce * 0.8;

      // Separation to make pushables solid
      const k_slop = 1.5;
      const percent = 0.45;
      const corr = Math.max(depth - k_slop, 0) * percent;
      const MAX_CORR = 8;
      const finalCorr = Math.min(corr, MAX_CORR);

      camX += nx * finalCorr;
      camY += ny * finalCorr;
      p.x -= nx * finalCorr;
      p.y -= ny * finalCorr;
    }
  }

  return onGround;
}

let stuckLastY = 0;
let stuckStartTime = null;
const STUCK_TIME_LIMIT = 3000;

let hardStuckStart = null;
let lastEarnings = 0;
const HARD_STUCK_TIME = 6000; //6sec
const HARD_MOVEMENT_THRESHOLD = 25;

function checkStuck() {

  if (inBlackHole) return;
  if (bhAnimating) return;

  if (!betPlaced || !fallStarted) {
    stuckStartTime = null;
    hardStuckStart = null;
    return;
  }

  const movement = Math.abs(camY - stuckLastY);
  stuckLastY = camY;

  if (movement < 5) {
    if (stuckStartTime === null)
      stuckStartTime = performance.now();
    else if (performance.now() - stuckStartTime >= STUCK_TIME_LIMIT)
      hardResetWorld(true, 2000);
  } else {
    stuckStartTime = null;
  }

  const now = performance.now();

  if (hardStuckStart === null) {
    hardStuckStart = now;
    lastEarnings = earnings;
    return;
  }

  const elapsed = now - hardStuckStart;
  const totalMovement = Math.abs(camY - freezeY);

  const barelyMoving =
    Math.abs(velY) < 0.6 &&
    Math.abs(velX) < 0.6 &&
    totalMovement < HARD_MOVEMENT_THRESHOLD;

  const noProgress = Math.abs(earnings - lastEarnings) < 0.5;

  if (barelyMoving && noProgress && elapsed >= HARD_STUCK_TIME) {
    hardResetWorld(true, 2000);
    hardStuckStart = null;
  }

  if (elapsed >= HARD_STUCK_TIME) {
    hardStuckStart = now;
    lastEarnings = earnings;
  }
}

//======black hole logic=====


function startBlackHoleAnimation(type, x, y, bh = null) {
  bhAnimating = true;
  bhAnimType = type;
  bhAnimStartTime = performance.now();
  bhAnimStartSize = type === 'enter' ? 150 : 800;
  bhAnimEndSize = type === 'enter' ? 800 : 150;

  bhAnimEl = document.createElement("div");
  bhAnimEl.className = "black-hole";
  bhAnimEl.style.width = bhAnimStartSize + "px";
  bhAnimEl.style.height = bhAnimStartSize + "px";
  bhAnimEl.style.left = (x - bhAnimStartSize / 2) + "px";
  bhAnimEl.style.top = (y - bhAnimStartSize / 2) + "px";
  bhAnimEl.style.background = `url('items/black_hole_1.png') no-repeat center/contain`;
  bhAnimEl.dataset.x = x;
  bhAnimEl.dataset.y = y;
  world.appendChild(bhAnimEl);

  if (type === 'enter' && bh) {
    bh.el.remove();
    blackHoles.splice(blackHoles.indexOf(bh), 1);
  }
}

function enterBlackHole(bh) {
  playSound('items/Black_hole_sound.mp3', 0.8);
  startBlackHoleAnimation('enter', bh.x + 50, bh.y + 50, bh);
}

function enterBlackHoleLogic() {
  inBlackHole = true;
  bhStartTime = performance.now();

  bhReturnX = camX;
  bhReturnY = camY;

  // Calculate max multiplier allowed to reach targetPayout
  let maxAllowedMult = 1;
  if (earnings > 0 && targetPayout > earnings) {
    maxAllowedMult = targetPayout / earnings;
  } else if (targetPayout === 0) {
    maxAllowedMult = 0;
  }

  // Set target multiplier somewhat randomly but capped by the outcome limit
  // If maxAllowedMult is huge (e.g. insane win), allow it.
  const randomMult = Math.random() * 15 + 1;
  bhTargetMultiplier = Math.min(randomMult, maxAllowedMult);

  bhCurrentMultiplier = 1;
  bhRiseHeight = 0;

  fallScorePaused = true;

  originalEarnings = earnings; // Store original earnings before multiplier

  camX = VOID_ZONE_X;
  camY = VOID_START_Y;

  velX = 0;
  velY = 0;
  angVel = 0;

  bhMovingBgEl = document.createElement("div");
  bhMovingBgEl.style.position = "absolute";
  bhMovingBgEl.style.width = VOID_BG_WIDTH + "px";
  bhMovingBgEl.style.height = VOID_BG_HEIGHT + "px";
  bhMovingBgEl.style.left =
    (SCREEN_W - VOID_BG_WIDTH) / 2 + "px";

  bhMovingBgEl.style.top = VOID_ZONE_Y + "px";
  bhMovingBgEl.style.backgroundImage = "url('items/Bonus_bg.png')";
  bhMovingBgEl.style.backgroundRepeat = "no-repeat";
  bhMovingBgEl.style.backgroundSize = VOID_BG_WIDTH + "px " + VOID_BG_HEIGHT + "px";
  bhMovingBgEl.style.backgroundPosition = "0 0";
  bhMovingBgEl.style.zIndex = "11";

  world.appendChild(bhMovingBgEl);

  // Spawn floating dollar signs
  for (let i = 0; i < 20; i++) {
    const el = document.createElement("div");
    el.textContent = "$";
    el.style.position = "absolute";
    el.style.color = "#00ff00";
    el.style.fontSize = (20 + Math.random() * 30) + "px";
    el.style.fontWeight = "bold";
    el.style.opacity = Math.random() * 0.5 + 0.5;
    el.style.zIndex = "12";

    const x = (SCREEN_W - VOID_BG_WIDTH) / 2 + Math.random() * VOID_BG_WIDTH;
    const y = VOID_START_Y - Math.random() * 1000; // Start around the player

    el.style.left = x + "px";
    el.style.top = y + "px";
    world.appendChild(el);

    voidSprites.push({
      el,
      x,
      y,
      speed: -(Math.random() * 2 + 1) // Float up
    });
  }

  // Swap sprite to jetpack in void zone
  originalSpriteBg = sprite.style.backgroundImage;
  sprite.style.backgroundImage = "url('items/jetpack.png')";

  showMultiplier(bhCurrentMultiplier);
}



function exitBlackHole() {
  inBlackHole = false;
  fallScorePaused = false;
  earnings += fallEarnings;
  fallEarnings = 0;

  camX = bhReturnX;
  camY = bhReturnY;

  velX = 0;
  velY = 0;
  angVel = 0;

  // Clear void sprites
  voidSprites.forEach(sprite => sprite.el.remove());
  voidSprites.length = 0;

  // Restore original sprite
  sprite.style.backgroundImage = originalSpriteBg;

  // Set exit position for animation
  bhExitX = camX + PLAYER_X;
  bhExitY = camY + PLAYER_Y;

  // Start black hole exit animation
  startBlackHoleAnimation('exit', bhExitX, bhExitY);

  // Start sprite exit animation
  exitingAnimation = true;
  exitAnimStart = performance.now();

  hideMultiplier();
  showScore();
}




function update() {
  if (!introFinished) return;
  frameCounter++;

  if (bhAnimating) {
    const now = performance.now();
    const elapsed = now - bhAnimStartTime;
    const progress = Math.min(elapsed / bhAnimDuration, 1);
    const currentSize = bhAnimStartSize + (bhAnimEndSize - bhAnimStartSize) * progress;

    bhAnimEl.style.width = currentSize + "px";
    bhAnimEl.style.height = currentSize + "px";
    bhAnimEl.style.left = (parseFloat(bhAnimEl.dataset.x) - currentSize / 2) + "px";
    bhAnimEl.style.top = (parseFloat(bhAnimEl.dataset.y) - currentSize / 2) + "px";

    if (progress >= 1) {
      bhAnimating = false;
      if (bhAnimType === 'enter') {
        enterBlackHoleLogic();
      }
      bhAnimEl.remove();
      bhAnimEl = null;
    }

    render();
    requestAnimationFrame(update);
    return;
  }

  if (exitingAnimation) {
    const now = performance.now();
    const elapsed = now - exitAnimStart;
    const duration = 1000; // 1 second animation
    const progress = Math.min(elapsed / duration, 1);

    // Simple scale animation
    const scale = 1 + Math.sin(progress * Math.PI) * 0.2;
    sprite.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${angle}rad)`;

    if (progress >= 1) {
      exitingAnimation = false;
      sprite.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    }

    render();
    requestAnimationFrame(update);
    return;
  }

  if (inBlackHole) {
    const now = performance.now();
    const elapsed = now - bhStartTime;

    if (bhShowcaseStart === 0) {
      camY -= BH_RISE_SPEED;

      // Update void sprites
      voidSprites.forEach(sprite => {
        sprite.y += sprite.speed;
        sprite.el.style.left = sprite.x + "px";
        sprite.el.style.top = sprite.y + "px";
      });

      const riseHeight = VOID_START_Y - camY;

      bhCurrentMultiplier = Math.min(16, 1 + (riseHeight / 120)); // Increase based on rise height, reaching ~16x at 120 height
      showMultiplier(bhCurrentMultiplier);

      if (bhCurrentMultiplier >= bhTargetMultiplier) {
        finalEarnings = earnings * bhCurrentMultiplier;
        bhShowcaseStart = now;
      }
    } else {
      // Showcase phase: display multiplier and animate score from original to multiplied for 1 second
      const showcaseElapsed = now - bhShowcaseStart;
      const progress = Math.min(showcaseElapsed / 1000, 1);
      showcaseScore = originalEarnings + (finalEarnings - originalEarnings) * progress;
      showMultiplier(bhCurrentMultiplier);
      if (showcaseElapsed >= 1000) {
        earnings = finalEarnings;
        exitBlackHole();
        bhShowcaseStart = 0;
      }
    }

    showScore();
    render();
    requestAnimationFrame(update);
    return;
  }




  if (grabbedByDarkCloud) {
    camX = freezeX;
    camY = freezeY;

    if (performance.now() >= releaseTime) {
      grabbedByDarkCloud = false;
      if (grabbedCloud) {
        grabbedCloud.el.remove();
        darkClouds.splice(darkClouds.indexOf(grabbedCloud), 1);
        grabbedCloud = null;
      }
      if (skeletonFlashInterval) clearInterval(skeletonFlashInterval);
      skeletonFlashInterval = null;
      skeleton.style.display = "none";
      sprite.style.display = "block";
      const angleSpread = (Math.random() * Math.PI / 2.2) - (Math.PI / 4.4);
      const power = 28;
      velX = Math.sin(angleSpread) * power;
      velY = -Math.cos(angleSpread) * power;
      angVel = (Math.random() - 0.5) * 0.08;
    }

    render();
    requestAnimationFrame(update);



    return;
  }

  // Throttled Recycling (every 30 frames ~ 0.5s)
  if (frameCounter % 30 === 0) {
    recycleClouds();
    recycleDarkClouds();
    recycleBlackHoles();
    recyclePushables();
  }

  // Update black hole rotations if player is within 2000x2000 pixel range
  for (let bh of blackHoles) {
    const playerX = camX + PLAYER_X;
    const playerY = camY + PLAYER_Y;
    const bhCenterX = bh.x + BH_SIZE / 2;
    const bhCenterY = bh.y + BH_SIZE / 2;
    const dx = Math.abs(bhCenterX - playerX);
    const dy = Math.abs(bhCenterY - playerY);
    if (dx <= 1000 && dy <= 1000) {
      bh.rotation += 0.05;
      bh.el.style.transform = `rotate(${bh.rotation}rad)`;
    }
  }

  // Update plane sound based on distance
  const playerX = camX + PLAYER_X;
  const playerY = camY + PLAYER_Y;
  const planeX = silverjetWrap.offsetLeft + silverjetWrap.offsetWidth / 2;
  const planeY = silverjetWrap.offsetTop + silverjetWrap.offsetHeight / 2;
  const distance = Math.hypot(playerX - planeX, playerY - planeY);

  if (distance <= 500 && !soundMuted) {
    const volume = Math.max(0, 0.1 - (distance / 500));
    if (!planeSoundPlaying) {
      planeSound = playSound('items/plane_sound.mp3', volume);
      if (planeSound) {
        planeSound.loop = true;
        planeSoundPlaying = true;
      }
    } else if (planeSound) {
      planeSound.volume = volume;
    }
  } else {
    // Stop sound if far away OR MUTED
    if (planeSoundPlaying && planeSound) {
      planeSound.pause();
      planeSound = null;
      planeSoundPlaying = false;
    }
  }

  const onGround = resolveCollisions();

  if (fallStarted && !onGround) velY += GRAVITY;
  velY = Math.min(velY, MAX_FALL);

  camX += velX;
  camY += velY;

  // Zero payout - trigger explosion after 50px fall, but not in bonus mode
  if (isZeroPayoutExplosion && !bonusMode && fallStarted && !betResolved) {
    const fallDistance = camY - zeroPayoutStartY;
    if (fallDistance >= 50) {
      betResolved = true;
      earnings = 0;
      fallStarted = false; // Stop all physics
      betPlaced = false;
      velX = 0;
      velY = 0;
      angVel = 0;
      triggerExplosion();
      isZeroPayoutExplosion = false;
      // Explosion handles its own animation, stop game update
      return;
    }
  }

  // Update pushable positions
  const PUSHABLE_PHYSICS_DIST = 1500;
  for (const p of pushables) {
    // Optimization: Skip physics for sleeping pushables far away
    const dy = Math.abs(p.y - (camY + PLAYER_Y));
    const isMoving = Math.abs(p.velX) > 0.1 || Math.abs(p.velY) > 0.1;

    if (dy < PUSHABLE_PHYSICS_DIST || isMoving) {
      p.x += p.velX;
      p.y += p.velY;
      p.velX *= 0.95; // Apply friction
      p.velY *= 0.95;
    }
  }

  velX *= onGround ? GROUND_FRICTION : AIR_FRICTION;
  angVel *= onGround ? 0.35 : 0.989;

  angle += angVel;

  // Detect flips
  const angleChange = angVel;
  angleAccumulator += angleChange;
  if (Math.abs(angleAccumulator) >= 2 * Math.PI) {
    const flipType = angleAccumulator > 0 ? "backflip" : "frontflip";
    showFlipText(flipType);
    angleAccumulator = 0;
  }

  // Skip fall earnings for zero payout
  if (betPlaced && fallStarted && velY > 0 && !fallScorePaused && !isZeroPayoutExplosion) {
    const fallDistance = camY - lastCamY;
    if (fallDistance > 2)
      earnings += fallDistance * Math.sqrt(multiplierBet) * 0.00006; // Reduced from 0.00015 to balance earnings
  }

  function checkPickup(arr) {
    // Skip item collection for zero payout - no earnings allowed
    if (isZeroPayoutExplosion) return;

    const playerColliders = getPlayerColliders();
    const itemRadius = 85; // Assuming 170px width/height, so radius 85

    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      let pickedUp = false;

      for (const pc of playerColliders) {
        const dx = pc.x - c.x;
        const dy = pc.y - c.y;
        const distSq = dx * dx + dy * dy;
        const minDist = pc.r + itemRadius;

        if (distSq < minDist * minDist) {
          pickedUp = true;
          break;
        }
      }

      if (pickedUp) {
        earnings += c.value;
        if (arr === chains) {
          playSound('items/nuke_sound.mp3', 0.6);
        } else if (arr === notes) {
          playSound('items/notes_sound.mp3', 0.6);
        }
        c.el.remove();
        arr.splice(i, 1);
      }
    }
  }

  checkPickup(chains);
  checkPickup(notes);

  if (onGround && fallStarted && !betResolved) {
    if (landedTime === 0) {
      landedTime = performance.now();
    } else if (performance.now() - landedTime > 200) {
      betResolved = true;

      // Payout is based on accumulated earnings during gameplay
      let payout = earnings;

      // Zero payout for losses
      if (isZeroPayoutExplosion || outcomeType === "lose") {
        payout = 0;
      }

      balance += payout;

      if (isZeroPayoutExplosion || payout === 0) {
        triggerExplosion();
        isZeroPayoutExplosion = false;
      } else {
        runOverEl.innerHTML = `
          <div class="final-win-banner">
            <div class="banner-ribbon">FINAL WIN</div>
            <div class="banner-amount">$${payout.toFixed(2)}</div>
          </div>
        `;
        runOverEl.style.display = "flex";
        fallStarted = false;
        betPlaced = false;
        updateBalanceUI();

        setTimeout(() => {
          runOverEl.style.display = "none";
          hardResetWorld(false, 0);
        }, 5000);
      }
    }
  } else {
    landedTime = 0;
  }

  lastCamY = camY;
  render();
  checkStuck();
  requestAnimationFrame(update);
  updateGroundEntitiesVisibility();

}

function render() {
  if (inBlackHole && bhShowcaseStart === 0) {
    scoreEl.style.display = "none";
    multiplierEl.classList.remove("showcase");
    scoreEl.classList.remove("showcase");
  } else {
    // Hide score during zero payout explosion
    if (isZeroPayoutExplosion) {
      scoreEl.style.display = "none";
    } else {
      scoreEl.style.display = "block";
      let displayScore = (inBlackHole && bhShowcaseStart > 0) ? showcaseScore : earnings;
      scoreEl.textContent = `$${displayScore.toFixed(2)}`;
    }
    if (inBlackHole && bhShowcaseStart > 0) {
      multiplierEl.classList.add("showcase");
      scoreEl.classList.add("showcase");
    } else {
      multiplierEl.classList.remove("showcase");
      scoreEl.classList.remove("showcase");
    }
  }
  world.style.transform = `translate(${-camX}px, ${-camY}px)`;
  silverjetWrap.style.left = PLAYER_X + "px";
  silverjetWrap.style.top = PLAYER_Y + "px";
  player.style.left = (camX + PLAYER_X) + 'px';
  player.style.top = (camY + PLAYER_Y) + 'px';
  player.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  sprite.style.left = (camX + PLAYER_X) + 'px';
  sprite.style.top = (camY + PLAYER_Y) + 'px';
  sprite.style.transform = `translate(-50%, -50%) rotate(${inBlackHole ? 0 : angle}rad)`;
  skeleton.style.left = (camX + PLAYER_X) + 'px';
  skeleton.style.top = (camY + PLAYER_Y) + 'px';
  skeleton.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;

  // Update pushable sprite positions
  // Optimize Pushable Rendering: Only update DOM if visible
  const PUSHABLE_RENDER_BUFFER = 1000;
  pushables.forEach(p => {
    if (Math.abs(p.y - (camY + PLAYER_Y)) < PUSHABLE_RENDER_BUFFER) {
      // Use left/top for positioning to avoid conflict with potential CSS transforms or double positioning
      p.el.style.left = p.x + "px";
      p.el.style.top = p.y + "px";
      if (p.el.style.display === 'none') p.el.style.display = 'block';
    } else {
      if (p.el.style.display !== 'none') p.el.style.display = 'none';
    }
  });



}

function triggerExplosion() {
  if (explosionTriggered) return; // Prevent multiple triggers
  explosionTriggered = true;
  explosionActive = true;
  explosionParts = [];

  // Hide the main sprite
  const sprite = document.getElementById("sprite");
  const skeleton = document.getElementById("skeleton");
  if (sprite) sprite.style.display = "none";
  if (skeleton) skeleton.style.display = "none";

  const playerX = camX + PLAYER_X;
  const playerY = camY + PLAYER_Y;

  // Create body parts with random velocities
  for (const part of BODY_PARTS) {
    const el = document.createElement("div");
    el.className = "explosion-part";
    el.style.cssText = `
            position: absolute;
            width: ${part.size}px;
            height: ${part.size}px;
            background: url('${part.image}') no-repeat center/contain;
            pointer-events: none;
            z-index: 10000;
        `;
    const x = playerX + part.offsetX;
    const y = playerY + part.offsetY;
    el.style.left = x + "px";
    el.style.top = y + "px";
    world.appendChild(el);

    // Random explosion velocity outward from center
    const angle = Math.atan2(part.offsetY, part.offsetX) + (Math.random() - 0.5) * 0.5;
    const speed = 15 + Math.random() * 20;
    explosionParts.push({
      el,
      x,
      y,
      velX: Math.cos(angle) * speed + (Math.random() - 0.5) * 10,
      velY: Math.sin(angle) * speed - 10 - Math.random() * 15, // Initial upward burst
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.3
    });
  }

  // Show "YOU LOST!" message
  const lostMsg = document.createElement("div");
  lostMsg.id = "lostMessage";
  lostMsg.innerHTML = `<span style="font-size: 72px;">💥</span><br>YOU LOST!`;
  lostMsg.style.cssText = `
        position: fixed;
        top: 30%;
        left: 50%;
        transform: translateX(-50%);
        color: #ff4444;
        font-size: 48px;
        font-weight: bold;
        text-shadow: 0 0 20px rgba(255,0,0,0.8), 2px 2px 4px black;
        z-index: 100001;
        text-align: center;
        animation: shake 0.5s ease-in-out;
    `;
  document.body.appendChild(lostMsg);

  // Add shake animation style if not exists
  if (!document.getElementById("explosionStyles")) {
    const style = document.createElement("style");
    style.id = "explosionStyles";
    style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(-50%) rotate(0deg); }
                25% { transform: translateX(-50%) rotate(-5deg); }
                50% { transform: translateX(-50%) rotate(5deg); }
                75% { transform: translateX(-50%) rotate(-3deg); }
            }
        `;
    document.head.appendChild(style);
  }

  // Animate explosion
  animateExplosion();
}

function animateExplosion() {
  if (!explosionActive) return;
  let allOffscreen = true;
  for (const part of explosionParts) {
    // Apply gravity - Increased to speed up "YOU LOST" duration
    part.velY += 1.6;
    // Apply velocity
    part.x += part.velX;
    part.y += part.velY;
    part.rotation += part.rotSpeed;
    // Update position
    part.el.style.left = part.x + "px";
    part.el.style.top = part.y + "px";
    part.el.style.transform = `rotate(${part.rotation}rad)`;
    // Check if still on screen (roughly)
    if (part.y < WORLDH + 500) {
      allOffscreen = false;
    }
  }
  if (!allOffscreen) {
    requestAnimationFrame(animateExplosion);
  } else {
    cleanupExplosion();
  }
}

function cleanupExplosion() {
  explosionActive = false;
  // Remove body parts
  for (const part of explosionParts) {
    if (part.el && part.el.parentNode) {
      part.el.remove();
    }
  }
  explosionParts = [];
  // Remove lost message
  const lostMsg = document.getElementById("lostMessage");
  if (lostMsg) lostMsg.remove();

  // Keep sprite HIDDEN until game resets - don't restore it here
  // sprite.style.display will be restored in resetGameWorld()

  // Immediately complete round and reset game
  // Use a delay (1000ms) for zero payout to keep pacing fast
  hardResetWorld(true, 1000);

  // Restart the main game loop since it was stopped
  requestAnimationFrame(update);
}

// Initial update() call removed; intro logic handles starting the game loop

// ========= MENU DROPDOWN & INFO MODALS =========

const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");
const rulesBtn = document.getElementById("rulesBtn");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const rulesModal = document.getElementById("rulesModal");
const howToPlayModal = document.getElementById("howToPlayModal");
const closeRulesModal = document.getElementById("closeRulesModal");
const closeHowToPlayModal = document.getElementById("closeHowToPlayModal");

// Toggle menu dropdown
menuBtn.onclick = (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle("show");
};

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.classList.remove("show");
  }
});

// Open Rules modal
rulesBtn.onclick = () => {
  menuDropdown.classList.remove("show");
  rulesModal.classList.add("show");
};

// Open How to Play modal
howToPlayBtn.onclick = () => {
  menuDropdown.classList.remove("show");
  howToPlayModal.classList.add("show");
};

// Close modals
closeRulesModal.onclick = () => {
  rulesModal.classList.remove("show");
};

closeHowToPlayModal.onclick = () => {
  howToPlayModal.classList.remove("show");
};

// Close modals when clicking backdrop
rulesModal.addEventListener("click", (e) => {
  if (e.target === rulesModal) rulesModal.classList.remove("show");
});

howToPlayModal.addEventListener("click", (e) => {
  if (e.target === howToPlayModal) howToPlayModal.classList.remove("show");
});

// Close modals with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    rulesModal.classList.remove("show");
    howToPlayModal.classList.remove("show");
    menuDropdown.classList.remove("show");
  }
});
