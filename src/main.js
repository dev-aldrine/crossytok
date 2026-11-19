import * as THREE from 'three';
import { sound } from './audio.js';
import { AutoBot } from './bot.js';
import {
  AI_STEP_DELAY,
  HOP_DURATION,
  HOP_HEIGHT,
  LANE_TYPES,
  PLAY_HALF_COLS,
  SPEEDS,
  TILE,
} from './constants.js';
import { PostPipeline } from './shaders/postProcess.js';
import { voxelLightingUniforms } from './shaders/voxelShader.js';
import { CHARACTER_SKINS, createCharacter } from './voxel.js';
import { getBiomeIndex, World } from './world.js';

const canvas = document.getElementById('game-canvas');
const hudBottomEl = document.querySelector('.hud-bottom');
const scoreEl = document.getElementById('score');
const goalLabelEl = document.getElementById('goal-label');
const goalFillEl = document.getElementById('goal-fill');
const bestScoreEl = document.getElementById('best-score');
const coinsEl = document.getElementById('coins');
const fpsEl = document.getElementById('fps-counter');
const milestoneEl = document.getElementById('milestone');
const banner = document.getElementById('banner');
const bannerTitle = document.getElementById('banner-title');
const bannerSub = document.getElementById('banner-sub');
const btnMode = document.getElementById('btn-mode');
const btnSkin = document.getElementById('btn-skin');
const btnSpeed = document.getElementById('btn-speed');
const btnCamera = document.getElementById('btn-camera');
const btnAspect = document.getElementById('btn-aspect');
const btnShaders = document.getElementById('btn-shaders');
const btnFps = document.getElementById('btn-fps');
const btnSound = document.getElementById('btn-sound');
const btnReset = document.getElementById('btn-reset');
const controlHint = document.getElementById('control-hint');

const SKIN_LABELS = {
  chicken: '🐔 Skin',
  duck: '🦆 Duck',
  frog: '🐸 Frog',
  fox: '🦊 Fox',
  robot: '🤖 Bot',
};

const BIOME_ATMOSPHERE = [
  {
    sky: new THREE.Color(0x93c5fd),
    skyTint: new THREE.Color(0xbae6fd),
    sunTint: new THREE.Color(0xfffbeb),
    warmth: new THREE.Color(1.04, 1.0, 0.94),
    sun: 1.05,
    hemi: 0.68,
    exposure: 1.04,
    bloom: 0.42,
    night: 0.0,
    label: 'MEADOW',
  },
  {
    sky: new THREE.Color(0xfdba74),
    skyTint: new THREE.Color(0xfed7aa),
    sunTint: new THREE.Color(0xfef3c7),
    warmth: new THREE.Color(1.08, 1.0, 0.9),
    sun: 1.12,
    hemi: 0.72,
    exposure: 1.0,
    bloom: 0.46,
    night: 0.0,
    label: 'DESERT',
  },
  {
    sky: new THREE.Color(0xcbd5e1),
    skyTint: new THREE.Color(0xe0f2fe),
    sunTint: new THREE.Color(0xf8fafc),
    warmth: new THREE.Color(0.96, 1.0, 1.06),
    sun: 0.96,
    hemi: 0.76,
    exposure: 0.94,
    bloom: 0.34,
    night: 0.0,
    label: 'SNOW',
  },
  {
    sky: new THREE.Color(0x0f172a),
    skyTint: new THREE.Color(0x38bdf8),
    sunTint: new THREE.Color(0x93c5fd),
    warmth: new THREE.Color(0.92, 0.97, 1.1),
    sun: 0.56,
    hemi: 0.44,
    exposure: 1.18,
    bloom: 0.72,
    night: 1.0,
    label: 'NIGHT',
  },
];

// Renderer setup (optimized pixel ratio & shadows)
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x93c5fd);
scene.fog = new THREE.Fog(0x93c5fd, 24, 52);

// Orthographic isometric camera
const FRUSTUM = 11.5;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
const postPipeline = new PostPipeline(
  renderer,
  scene,
  camera,
  window.innerWidth,
  window.innerHeight
);

function updateCameraProjection() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const aspect = w / h;
  camera.left = (-FRUSTUM * aspect) / 2;
  camera.right = (FRUSTUM * aspect) / 2;
  camera.top = FRUSTUM / 2;
  camera.bottom = -FRUSTUM / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  postPipeline.setSize(w, h);
}
updateCameraProjection();
window.addEventListener('resize', updateCameraProjection);

// Lighting (balanced daylight 3-point setup)
const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x4ade80, 0.68);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.05);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 42;
dirLight.shadow.camera.left = -12;
dirLight.shadow.camera.right = 12;
dirLight.shadow.camera.top = 14;
dirLight.shadow.camera.bottom = -14;
dirLight.shadow.bias = -0.0006;
scene.add(dirLight);
scene.add(dirLight.target);

const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.36);
fillLight.position.set(-8, 7, -6);
scene.add(fillLight);

// Game state
const world = new World(scene);
const bot = new AutoBot();
let skinIdx = 0;
let player = createCharacter(CHARACTER_SKINS[skinIdx]);
scene.add(player);

let bestScore = 0;
try {
  bestScore = Number(localStorage.getItem('crossy_auto_best') || 0);
} catch {
  bestScore = 0;
}
bestScoreEl.textContent = String(bestScore);

const state = {
  autoPlay: true,
  speedIdx: 0,
  cameraMode: 'iso', // 'iso' | 'follow'
  portrait: false,
  alive: true,
  won: false,
  winTimer: 0,
  goalTarget: 100,
  deathTimer: 0,
  playerX: 0,
  playerRow: 0,
  maxRow: 0,
  coins: 0,
  hopping: false,
  hopTime: 0,
  hopStartX: 0,
  hopStartRow: 0,
  hopTargetX: 0,
  hopTargetRow: 0,
  aiCooldown: 0,
  queuedMove: null,
  camFocusX: 0,
  camFocusZ: 0,
  shake: 0,
  milestoneTimer: 0,
  newBestAnnounced: false,
  lastBiomeIdx: 0,
  elapsed: 0,
};

function showMilestone(text) {
  milestoneEl.textContent = text;
  milestoneEl.hidden = false;
  state.milestoneTimer = 1.25;
  sound.playMilestone();
}

function swapSkin(nextIdx) {
  skinIdx = nextIdx % CHARACTER_SKINS.length;
  const oldPos = player.position.clone();
  const oldRot = player.rotation.y;
  scene.remove(player);
  player = createCharacter(CHARACTER_SKINS[skinIdx]);
  player.position.copy(oldPos);
  player.rotation.y = oldRot;
  scene.add(player);
  btnSkin.textContent = SKIN_LABELS[CHARACTER_SKINS[skinIdx]];
}

function saveBest(score) {
  if (score > bestScore) {
    const wasPositive = bestScore > 0;
    bestScore = score;
    bestScoreEl.textContent = String(bestScore);
    if (wasPositive && !state.newBestAnnounced) {
      state.newBestAnnounced = true;
      showMilestone('NEW BEST!');
    }
    try {
      localStorage.setItem('crossy_auto_best', String(bestScore));
    } catch {
      // ignore storage errors
    }
  }
}

function resetGame() {
  state.alive = true;
  state.won = false;
  state.winTimer = 0;
  state.deathTimer = 0;
  state.playerX = 0;
  state.playerRow = 0;
  state.maxRow = 0;
  state.coins = 0;
  state.hopping = false;
  state.hopTime = 0;
  state.aiCooldown = 0.15;
  state.queuedMove = null;
  state.camFocusX = 0;
  state.camFocusZ = 0;
  state.shake = 0;
  state.milestoneTimer = 0;
  state.newBestAnnounced = false;
  state.lastBiomeIdx = 0;

  world.reset(state.goalTarget);
  bot.reset();

  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
  player.scale.set(1, 1, 1);
  player.userData.body.scale.set(1, 1, 1);
  player.visible = true;

  scoreEl.textContent = '0';
  goalLabelEl.textContent = `0 / ${state.goalTarget} 🏁`;
  goalFillEl.style.width = '0%';
  coinsEl.textContent = '0';
  banner.classList.remove('is-winner');
  banner.hidden = true;
  milestoneEl.hidden = true;
}

function winGoal() {
  if (state.won || !state.alive) return;
  state.won = true;
  state.winTimer = 0;
  state.hopping = false;

  sound.playMilestone();
  world.spawnBurst(state.playerX, 0.5, -state.playerRow * TILE, 22, false);

  const cleared = state.goalTarget;
  const nextGoal = cleared + 100;
  state.goalTarget = nextGoal;

  banner.classList.add('is-winner');
  bannerTitle.textContent = `🏆 GOAL ${cleared} CLEARED!`;
  bannerSub.textContent = `Next goal: ${nextGoal} • Resetting...`;
  banner.hidden = false;
}

function triggerHop(dx, dz) {
  if (!state.alive || state.won) return;
  if (dx === 0 && dz === 0) return;

  const baseCol = Math.round(state.playerX);
  const targetCol = baseCol + dx;
  const targetRow = state.playerRow + dz;

  if (Math.abs(targetCol) > PLAY_HALF_COLS) return;
  if (targetRow < state.maxRow - 4) return;

  const targetLane = world.getLane(targetRow);
  if (targetLane?.type === LANE_TYPES.GRASS && targetLane.obstacles.has(targetCol)) {
    return;
  }

  // Dip & splash effect when jumping off a log or lily pad
  const currentLane = world.getLane(state.playerRow);
  if (currentLane?.type === LANE_TYPES.RIVER) {
    world.triggerRiverSplash(state.playerRow, state.playerX, -0.11, true);
    sound.playSplash(true);
  }

  state.hopping = true;
  state.hopTime = 0;
  state.hopStartX = state.playerX;
  state.hopStartRow = state.playerRow;
  state.hopTargetX = targetCol;
  state.hopTargetRow = targetRow;

  // Face hop direction (-Z is forward at rotation.y = 0)
  player.rotation.y = Math.atan2(-dx, dz);
  sound.playHop();
}

function die(reason, isWater = false) {
  if (!state.alive) return;
  state.alive = false;
  state.hopping = false;
  state.deathTimer = 0;

  sound.playCrash(isWater);
  world.spawnBurst(state.playerX, 0.25, -state.playerRow * TILE, 14, isWater);
  state.shake = isWater ? 0.14 : 0.28;

  if (isWater) {
    player.position.y = -0.35;
  } else {
    player.scale.set(1.25, 0.28, 1.25);
  }

  bannerTitle.textContent = reason;
  bannerSub.textContent = state.autoPlay ? 'Auto-respawning...' : 'Press R or Reset';
  banner.hidden = false;
}

function checkCoinPickup() {
  const lane = world.getLane(state.playerRow);
  if (lane?.coin && !lane.coin.collected) {
    if (Math.abs(state.playerX - lane.coin.col) < 0.6) {
      lane.coin.collected = true;
      lane.coin.mesh.visible = false;
      state.coins++;
      coinsEl.textContent = String(state.coins);
      sound.playCoin();
      world.spawnBurst(lane.coin.col, 0.4, -state.playerRow * TILE, 6, false);
    }
  }
}

function checkHazardsAndRiver(dt) {
  const lane = world.getLane(state.playerRow);
  if (!lane) return;

  if (lane.type === LANE_TYPES.ROAD) {
    for (const m of lane.movers) {
      if (Math.abs(state.playerX - m.x) < m.halfWidth + 0.22) {
        die('SMASHED!', false);
        return;
      }
    }
  } else if (lane.type === LANE_TYPES.RAIL && lane.train?.active) {
    if (Math.abs(state.playerX - lane.train.x) < lane.train.halfWidth + 0.22) {
      die('TRAINED!', false);
      return;
    }
  } else if (lane.type === LANE_TYPES.RIVER && !state.hopping) {
    if (lane.lilyPads && lane.lilyPads.size > 0) {
      const col = Math.round(state.playerX);
      if (!lane.lilyPads.has(col)) {
        die('SPLASH!', true);
        return;
      }
      const pad = lane.lilyPadMeshes?.get(col);
      if (pad) {
        pad.userData.sink = Math.min(pad.userData.sink || 0, -0.045);
        player.position.y = pad.position.y + 0.06;
      } else {
        player.position.y = 0.01;
      }
      return;
    }

    let onLog = null;
    for (const m of lane.movers) {
      if (Math.abs(state.playerX - m.x) <= m.halfWidth + 0.14) {
        onLog = m;
        break;
      }
    }
    if (!onLog) {
      die('SPLASH!', true);
      return;
    }
    onLog.mesh.userData.sink = Math.min(onLog.mesh.userData.sink || 0, -0.035);
    state.playerX += lane.speed * dt;
    player.position.x = state.playerX;
    player.position.y = onLog.mesh.position.y + 0.12;
    if (Math.abs(state.playerX) > PLAY_HALF_COLS + 0.65) {
      die('SWEPT AWAY!', true);
    }
  }
}

function updatePlayer(dt) {
  if (state.won) {
    state.winTimer += dt;
    if (state.winTimer >= 2.2) {
      resetGame();
    }
    return;
  }

  if (!state.alive) {
    state.deathTimer += dt;
    if (state.autoPlay && state.deathTimer >= 1.15) {
      resetGame();
    }
    return;
  }

  if (state.hopping) {
    state.hopTime += dt;
    const t = Math.min(1, state.hopTime / HOP_DURATION);

    state.playerX = THREE.MathUtils.lerp(state.hopStartX, state.hopTargetX, t);
    const z = -THREE.MathUtils.lerp(state.hopStartRow, state.hopTargetRow, t) * TILE;
    const arcY = Math.sin(t * Math.PI) * HOP_HEIGHT;

    player.position.set(state.playerX, arcY, z);
    // Subtle hop stretch
    const stretch = 1 + Math.sin(t * Math.PI) * 0.16;
    player.userData.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    if (t >= 1) {
      state.hopping = false;
      state.playerX = state.hopTargetX;
      state.playerRow = state.hopTargetRow;
      player.position.set(state.playerX, 0, -state.playerRow * TILE);
      player.userData.body.scale.set(1.12, 0.86, 1.12);

      if (state.playerRow > state.maxRow) {
        state.maxRow = state.playerRow;
        scoreEl.textContent = String(state.maxRow);
        const pct = Math.min(100, (state.maxRow / state.goalTarget) * 100);
        goalFillEl.style.width = `${pct}%`;
        goalLabelEl.textContent = `${state.maxRow} / ${state.goalTarget} 🏁`;
        saveBest(state.maxRow);
        world.ensureLanesAround(state.maxRow);

        if (state.maxRow >= state.goalTarget) {
          winGoal();
          return;
        }

        const biomeIdx = getBiomeIndex(state.maxRow);
        if (biomeIdx !== state.lastBiomeIdx) {
          state.lastBiomeIdx = biomeIdx;
          showMilestone(BIOME_ATMOSPHERE[biomeIdx].label);
        } else if (state.maxRow > 0 && state.maxRow % 50 === 0) {
          showMilestone(`${state.maxRow}!`);
        }
      }

      checkCoinPickup();
      world.triggerRiverSplash(state.playerRow, state.playerX, -0.075, false);

      if (state.queuedMove) {
        const next = state.queuedMove;
        state.queuedMove = null;
        triggerHop(next.dx, next.dz);
      } else if (state.autoPlay) {
        const curLane = world.getLane(state.playerRow);
        const onRiskyLane =
          curLane?.type === LANE_TYPES.ROAD ||
          curLane?.type === LANE_TYPES.RAIL ||
          (curLane?.type === LANE_TYPES.RIVER && !(curLane.lilyPads?.size > 0));
        state.aiCooldown = onRiskyLane ? 0.025 : AI_STEP_DELAY;
      }
    }
  } else {
    // Recover squash smoothly to idle
    const body = player.userData.body;
    body.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 16));

    if (state.autoPlay) {
      state.aiCooldown -= dt;
      if (state.aiCooldown <= 0) {
        const move = bot.decideMove(
          world,
          state.playerX,
          state.playerRow,
          state.maxRow - 4
        );
        if (move.dx !== 0 || move.dz !== 0) {
          triggerHop(move.dx, move.dz);
        } else {
          state.aiCooldown = 0.05;
        }
      }
    }
  }

  checkHazardsAndRiver(dt);
}

function updateCameraAndLight(dt) {
  const targetX = state.playerX * 0.55;
  const targetZ = -state.maxRow * TILE;
  const lerpFactor = Math.min(1, dt * 6.5);

  state.camFocusX = THREE.MathUtils.lerp(state.camFocusX, targetX, lerpFactor);
  state.camFocusZ = THREE.MathUtils.lerp(state.camFocusZ, targetZ, lerpFactor);

  // Micro camera shake decay (also subtle rumble if a train is passing nearby)
  for (let r = state.playerRow - 2; r <= state.playerRow + 3; r++) {
    const l = world.getLane(r);
    if (l?.type === LANE_TYPES.RAIL && l.train?.active && Math.abs(l.train.x) < 12) {
      state.shake = Math.max(state.shake, 0.045);
      break;
    }
  }
  state.shake *= Math.exp(-dt * 12);
  const sx = (Math.random() - 0.5) * state.shake;
  const sy = (Math.random() - 0.5) * state.shake;

  if (state.cameraMode === 'iso') {
    camera.position.set(state.camFocusX + 7.5 + sx, 11.5 + sy, state.camFocusZ + 8.5);
  } else {
    camera.position.set(state.camFocusX + 1.8 + sx, 12.0 + sy, state.camFocusZ + 9.5);
  }
  camera.lookAt(state.camFocusX + sx * 0.5, 0, state.camFocusZ - 2.2);

  // Keep shadow frustum locked around the active play area
  dirLight.position.set(state.camFocusX + 8, 16, state.camFocusZ + 6);
  dirLight.target.position.set(state.camFocusX, 0, state.camFocusZ - 2);
  dirLight.target.updateMatrixWorld();

  // Smooth biome sky/fog/lighting & Minecraft shader atmosphere transition
  const atm = BIOME_ATMOSPHERE[getBiomeIndex(state.maxRow)];
  const bLerp = Math.min(1, dt * 1.8);
  scene.background.lerp(atm.sky, bLerp);
  scene.fog.color.lerp(atm.sky, bLerp);
  dirLight.intensity = THREE.MathUtils.lerp(dirLight.intensity, atm.sun, bLerp);
  hemiLight.intensity = THREE.MathUtils.lerp(hemiLight.intensity, atm.hemi, bLerp);

  voxelLightingUniforms.uSkyTint.value.lerp(atm.skyTint, bLerp);
  voxelLightingUniforms.uSunTint.value.lerp(atm.sunTint, bLerp);
  voxelLightingUniforms.uNightFactor.value = THREE.MathUtils.lerp(
    voxelLightingUniforms.uNightFactor.value,
    atm.night,
    bLerp
  );
  postPipeline.setAtmosphere(
    THREE.MathUtils.lerp(postPipeline.gradePass.uniforms.uExposure.value, atm.exposure, bLerp),
    postPipeline.gradePass.uniforms.uWarmth.value.clone().lerp(atm.warmth, bLerp),
    THREE.MathUtils.lerp(postPipeline.bloomPass.strength, atm.bloom, bLerp)
  );

  if (state.milestoneTimer > 0) {
    state.milestoneTimer -= dt;
    if (state.milestoneTimer <= 0) {
      milestoneEl.hidden = true;
    }
  }
}

function updateSpatialAudio() {
  if (!sound.enabled) return;

  let riverProx = 0;
  let roadProx = 0;

  for (let r = state.playerRow - 3; r <= state.playerRow + 4; r++) {
    const l = world.getLane(r);
    if (!l) continue;
    const distWeight = 1 - Math.abs(r - state.playerRow) / 5;

    if (l.type === LANE_TYPES.RIVER) {
      riverProx = Math.max(riverProx, distWeight);
    } else if (l.type === LANE_TYPES.ROAD) {
      roadProx = Math.max(roadProx, distWeight);
      if (Math.abs(r - state.playerRow) <= 2) {
        for (const m of l.movers) {
          if (Math.abs(m.x - state.playerX) < 0.75) {
            sound.playCarPass(Math.abs(l.speed) / 3);
            break;
          }
        }
      }
    } else if (l.type === LANE_TYPES.RAIL && l.train) {
      const warnTime = l.trainPeriod - 1.3;
      if (l.train.active && Math.abs(l.train.x) < 12) {
        sound.playTrainRumble();
      } else if (l.trainTimer >= warnTime) {
        sound.playTrainBell();
      }
    }
  }

  sound.updateAmbient(riverProx, roadProx, document.hidden);
}

// UI Controls
function syncModeUI() {
  btnMode.classList.toggle('active', state.autoPlay);
  btnMode.textContent = state.autoPlay ? '🤖 Auto' : '🎮 Manual';
  controlHint.innerHTML = state.autoPlay
    ? 'Watching AI • <kbd>Space</kbd> Take Over • <kbd>`</kbd> Hide UI'
    : '<kbd>WASD</kbd> / <kbd>Arrows</kbd> Move • <kbd>Space</kbd> Auto • <kbd>`</kbd> Hide UI';
}

function toggleMode() {
  state.autoPlay = !state.autoPlay;
  state.queuedMove = null;
  state.aiCooldown = 0.05;
  syncModeUI();
}

btnMode.addEventListener('click', toggleMode);

btnSkin.addEventListener('click', () => {
  swapSkin(skinIdx + 1);
});

btnSpeed.addEventListener('click', () => {
  state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
  btnSpeed.textContent = `${SPEEDS[state.speedIdx].toFixed(1)}×`;
});

btnCamera.addEventListener('click', () => {
  state.cameraMode = state.cameraMode === 'iso' ? 'follow' : 'iso';
  btnCamera.textContent = state.cameraMode === 'iso' ? '📷 Iso' : '📷 Follow';
});

btnAspect.addEventListener('click', () => {
  state.portrait = !state.portrait;
  document.body.classList.toggle('portrait-mode', state.portrait);
  btnAspect.classList.toggle('active', state.portrait);
  updateCameraProjection();
});

btnShaders.addEventListener('click', () => {
  postPipeline.enabled = !postPipeline.enabled;
  renderer.toneMapping = postPipeline.enabled
    ? THREE.NoToneMapping
    : THREE.ACESFilmicToneMapping;
  btnShaders.classList.toggle('active', postPipeline.enabled);
});

let showFps = false;
let fpsFrames = 0;
let fpsAccum = 0;
btnFps.addEventListener('click', () => {
  showFps = !showFps;
  fpsEl.hidden = !showFps;
  btnFps.classList.toggle('active', showFps);
  fpsFrames = 0;
  fpsAccum = 0;
});

btnSound.addEventListener('click', () => {
  const on = sound.toggle();
  btnSound.textContent = on ? '🔊 Sound' : '🔇 Mute';
  btnSound.classList.toggle('active', on);
});

btnReset.addEventListener('click', resetGame);

function handleManualMove(dx, dz) {
  if (state.autoPlay) {
    state.autoPlay = false;
    syncModeUI();
  }
  if (!state.alive) return;
  if (state.hopping) {
    state.queuedMove = { dx, dz };
  } else {
    triggerHop(dx, dz);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') {
    e.preventDefault();
    hudBottomEl.classList.toggle('is-hidden');
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    toggleMode();
    return;
  }
  if (e.code === 'KeyR') {
    resetGame();
    return;
  }

  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      handleManualMove(0, 1);
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      handleManualMove(0, -1);
      break;
    case 'ArrowLeft':
    case 'KeyA':
      e.preventDefault();
      handleManualMove(-1, 0);
      break;
    case 'ArrowRight':
    case 'KeyD':
      e.preventDefault();
      handleManualMove(1, 0);
      break;
  }
});

// Touch / swipe support for mobile
let touchStart = null;
canvas.addEventListener(
  'pointerdown',
  (e) => {
    touchStart = { x: e.clientX, y: e.clientY };
  },
  { passive: true }
);
canvas.addEventListener(
  'pointerup',
  (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 20) {
      if (!state.autoPlay) handleManualMove(0, 1);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      handleManualMove(dx > 0 ? 1 : -1, 0);
    } else {
      handleManualMove(0, dy < 0 ? 1 : -1);
    }
  },
  { passive: true }
);

// Main loop
resetGame();
syncModeUI();

let lastTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (document.hidden) return;

  if (showFps) {
    fpsFrames++;
    fpsAccum += rawDt;
    if (fpsAccum >= 0.4) {
      fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
      fpsFrames = 0;
      fpsAccum = 0;
    }
  }

  const dt = rawDt * SPEEDS[state.speedIdx];
  state.elapsed += dt;

  world.update(dt, state.elapsed);
  updatePlayer(dt);
  updateCameraAndLight(rawDt);
  updateSpatialAudio();

  postPipeline.render(scene, camera);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.updateAmbient(0, 0, true);
});

requestAnimationFrame(animate);
