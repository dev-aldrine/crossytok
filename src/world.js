import * as THREE from 'three';
import {
  LANE_TYPES,
  LANES_AHEAD,
  LANES_BEHIND,
  PLAY_HALF_COLS,
  TILE,
  VISUAL_HALF_COLS,
  WRAP_LIMIT,
} from './constants.js';
import {
  VoxelBatch,
  addBox,
  appendCactusBoxes,
  appendRockBoxes,
  appendSnowPineBoxes,
  appendTreeBoxes,
  createBus,
  createCar,
  createCoin,
  createLilyPad,
  createLog,
  createParticleCube,
  createSportsCar,
  createTrain,
  createTruck,
  getMaterial,
} from './voxel.js';
import { createWaterStrip, triggerWaterRipple, updateWaterShader } from './water.js';

const BIOME_PALETTES = [
  { name: 'meadow', innerA: 0x86efac, innerB: 0x4ade80, outerA: 0x22c55e, outerB: 0x16a34a },
  { name: 'desert', innerA: 0xfde68a, innerB: 0xfcd34d, outerA: 0xd97706, outerB: 0xb45309 },
  { name: 'snow', innerA: 0xf8fafc, innerB: 0xe2e8f0, outerA: 0x94a3b8, outerB: 0x64748b },
  { name: 'night', innerA: 0x1e3a5f, innerB: 0x172554, outerA: 0x0f172a, outerB: 0x020617 },
];

export function getBiomeIndex(row) {
  return Math.floor(Math.max(0, row) / 45) % BIOME_PALETTES.length;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.lanes = new Map();
    this.minRow = 0;
    this.maxRow = -1;
    this.prevRiverDir = 1;
    this.elapsed = 0;
    this.goalRow = 100;

    // Pre-allocated particle pool
    this.particles = [];
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
    this._initParticles();
  }

  _initParticles() {
    const colors = [0xffffff, 0xfacc15, 0x38bdf8, 0xef4444];
    for (let i = 0; i < 28; i++) {
      const mesh = createParticleCube(colors[i % colors.length]);
      mesh.visible = false;
      this.particleGroup.add(mesh);
      this.particles.push({
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
      });
    }
  }

  spawnBurst(x, y, z, count = 8, isWater = false) {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.life <= 0) {
        p.mesh.visible = true;
        p.mesh.position.set(x, y + 0.2, z);
        p.mesh.material = p.mesh.material; // keep pooled material
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 2.5;
        p.vx = Math.cos(angle) * spd;
        p.vy = (isWater ? 3.2 : 2.6) + Math.random() * 2.2;
        p.vz = Math.sin(angle) * spd;
        p.maxLife = 0.35 + Math.random() * 0.25;
        p.life = p.maxLife;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  _disposeLane(lane) {
    this.scene.remove(lane.group);
    if (lane.disposables) {
      for (const geo of lane.disposables) {
        geo.dispose();
      }
    }
  }

  reset(goalRow = 100) {
    this.goalRow = goalRow;
    for (const lane of this.lanes.values()) {
      this._disposeLane(lane);
    }
    this.lanes.clear();
    this.minRow = -LANES_BEHIND;
    this.maxRow = -LANES_BEHIND - 1;

    for (const p of this.particles) {
      p.life = 0;
      p.mesh.visible = false;
    }

    this.ensureLanesAround(0);
  }

  ensureLanesAround(centerRow) {
    const targetMin = centerRow - LANES_BEHIND;
    const targetMax = centerRow + LANES_AHEAD;

    while (this.maxRow < targetMax) {
      const nextRow = this.maxRow + 1;
      const lane = this._buildLane(nextRow);
      this.lanes.set(nextRow, lane);
      this.scene.add(lane.group);
      this.maxRow = nextRow;
    }

    while (this.minRow < targetMin) {
      const old = this.lanes.get(this.minRow);
      if (old) {
        this._disposeLane(old);
        this.lanes.delete(this.minRow);
      }
      this.minRow++;
    }
  }

  getLane(row) {
    return this.lanes.get(row) || null;
  }

  _pickLaneType(row) {
    if (row <= 3 || row === this.goalRow) return LANE_TYPES.GRASS;
    const r = Math.random();
    if (r < 0.34) return LANE_TYPES.GRASS;
    if (r < 0.72) return LANE_TYPES.ROAD;
    if (r < 0.92) return LANE_TYPES.RIVER;
    return LANE_TYPES.RAIL;
  }

  _buildLane(row) {
    const type = this._pickLaneType(row);
    const group = new THREE.Group();
    group.position.set(0, 0, -row * TILE);

    const lane = {
      row,
      type,
      group,
      disposables: [],
      obstacles: new Set(),
      lilyPads: new Set(),
      lilyPadMeshes: new Map(),
      movers: [], // cars, trucks, logs
      speed: 0,
      coin: null,
      train: null,
      trainTimer: 0,
      trainPeriod: 6.5,
      trainWarnMesh: null,
      trainGate: null,
    };

    const stripWidth = (VISUAL_HALF_COLS * 2 + 1) * TILE;
    const biomeIdx = getBiomeIndex(row);
    const biome = BIOME_PALETTES[biomeIdx];
    const groundBatch = new VoxelBatch();

    if (type === LANE_TYPES.GRASS) {
      const isAlt = Math.abs(row) % 2 === 0;
      const isFinishLine = row === this.goalRow;
      const propBatch = new VoxelBatch();

      if (isFinishLine) {
        // Checkered finish line tiles across playable width + gold/red flag posts
        for (let c = -PLAY_HALF_COLS; c <= PLAY_HALF_COLS; c++) {
          groundBatch.add(0.5, 0.24, 0.5, c - 0.25, -0.12, -0.25, 0xf8fafc);
          groundBatch.add(0.5, 0.24, 0.5, c + 0.25, -0.12, -0.25, 0x0f172a);
          groundBatch.add(0.5, 0.24, 0.5, c - 0.25, -0.12, 0.25, 0x0f172a);
          groundBatch.add(0.5, 0.24, 0.5, c + 0.25, -0.12, 0.25, 0xf8fafc);
        }
        // Finish-line flag pillars on left & right edges
        for (const side of [-PLAY_HALF_COLS - 0.85, PLAY_HALF_COLS + 0.85]) {
          propBatch.add(0.16, 1.5, 0.16, side, 0.75, 0, 0xfacc15);
          propBatch.add(0.55, 0.34, 0.12, side + (side < 0 ? 0.28 : -0.28), 1.32, 0, 0xef4444);
        }
      } else {
        // Playable center turf
        groundBatch.add(
          (PLAY_HALF_COLS * 2 + 1) * TILE,
          0.24,
          TILE,
          0,
          -0.12,
          0,
          isAlt ? biome.innerA : biome.innerB
        );
      }
      const sideW = (VISUAL_HALF_COLS - PLAY_HALF_COLS) * TILE;
      const sideX = (PLAY_HALF_COLS + 0.5 + (VISUAL_HALF_COLS - PLAY_HALF_COLS) / 2) * TILE;
      groundBatch.add(sideW, 0.28, TILE, -sideX, -0.1, 0, isAlt ? biome.outerA : biome.outerB);
      groundBatch.add(sideW, 0.28, TILE, sideX, -0.1, 0, isAlt ? biome.outerA : biome.outerB);

      const appendBiomeProp = (ox, seed) => {
        if (seed % 3 === 0) {
          appendRockBoxes(propBatch, ox, 0, seed);
        } else if (biomeIdx === 1) {
          appendCactusBoxes(propBatch, ox, 0);
        } else if (biomeIdx === 2) {
          appendSnowPineBoxes(propBatch, ox, 0);
        } else {
          appendTreeBoxes(propBatch, ox, 0, seed % 3);
        }
      };

      // Outer border props
      for (let c = -VISUAL_HALF_COLS; c <= VISUAL_HALF_COLS; c++) {
        if (Math.abs(c) > PLAY_HALF_COLS) {
          if (Math.abs(c) === PLAY_HALF_COLS + 1 || Math.random() < 0.55) {
            appendBiomeProp(c * TILE, Math.abs(c + row));
          }
        }
      }

      // Inner obstacles (never on starting rows <= 1 or finish line)
      if (row > 1 && !isFinishLine) {
        let placed = 0;
        let streak = 0;
        for (let c = -PLAY_HALF_COLS; c <= PLAY_HALF_COLS; c++) {
          if (placed >= 4) break;
          if (streak < 2 && Math.random() < 0.18) {
            lane.obstacles.add(c);
            if (Math.random() < 0.35) {
              appendRockBoxes(propBatch, c * TILE, 0, Math.floor(Math.random() * 2));
            } else {
              appendBiomeProp(c * TILE, Math.floor(Math.random() * 3) + 1);
            }
            placed++;
            streak++;
          } else {
            streak = 0;
            if (Math.random() < 0.14) {
              const flowerColors =
                biomeIdx === 1
                  ? [0xf59e0b, 0xd97706, 0xfef3c7]
                  : biomeIdx === 2
                  ? [0xe0f2fe, 0xbae6fd, 0xffffff]
                  : [0xfef08a, 0xf472b6, 0xffffff];
              const fc = flowerColors[Math.abs(c + row) % flowerColors.length];
              groundBatch.add(0.12, 0.04, 0.12, c * TILE + 0.22, 0.028, -0.18, fc);
            }
          }
        }
      }

      const propMesh = propBatch.toMesh(true, true);
      if (propMesh) {
        group.add(propMesh);
        lane.disposables.push(propMesh.geometry);
      }

      // Optional coin on open grass
      if (row > 2 && Math.random() < 0.22) {
        const openCols = [];
        for (let c = -PLAY_HALF_COLS + 1; c <= PLAY_HALF_COLS - 1; c++) {
          if (!lane.obstacles.has(c)) openCols.push(c);
        }
        if (openCols.length > 0) {
          const cc = openCols[Math.floor(Math.random() * openCols.length)];
          const coinMesh = createCoin();
          coinMesh.position.x = cc * TILE;
          group.add(coinMesh);
          lane.coin = { col: cc, mesh: coinMesh, collected: false };
        }
      }
    } else if (type === LANE_TYPES.ROAD) {
      groundBatch.add(stripWidth, 0.2, TILE, 0, -0.12, 0, 0x334155);
      // Dashed lane divider only on the seam between two adjacent road lanes
      const prevLane = this.getLane(row - 1);
      if (prevLane?.type === LANE_TYPES.ROAD) {
        for (let x = -VISUAL_HALF_COLS; x <= VISUAL_HALF_COLS; x += 2) {
          groundBatch.add(0.72, 0.016, 0.08, x, -0.004, 0.5, 0x64748b);
        }
      }

      const diff = Math.min(1.85, 1 + row * 0.008);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const roll = Math.random();
      const vehicleKind = roll < 0.24 ? 'sports' : roll < 0.44 ? 'bus' : roll < 0.68 ? 'truck' : 'car';
      const baseSpeed =
        vehicleKind === 'sports'
          ? (3.6 + Math.random() * 2.2) * diff
          : (2.3 + Math.random() * 2.2) * diff;
      lane.speed = dir * baseSpeed;

      const count =
        vehicleKind === 'bus' || vehicleKind === 'truck'
          ? 2 + Math.floor(Math.random() * 2)
          : 2 + Math.floor(Math.random() * 3);
      const span = WRAP_LIMIT * 2;
      const step = span / count;

      for (let i = 0; i < count; i++) {
        let mesh;
        let halfWidth;
        if (vehicleKind === 'sports') {
          mesh = createSportsCar(row + i);
          halfWidth = 0.78;
        } else if (vehicleKind === 'bus') {
          mesh = createBus(row + i);
          halfWidth = 1.3;
        } else if (vehicleKind === 'truck') {
          mesh = createTruck(row + i);
          halfWidth = 1.25;
        } else {
          mesh = createCar(row + i);
          halfWidth = 0.74;
        }
        const x = -WRAP_LIMIT + i * step + (Math.random() - 0.5) * 1.4;
        mesh.position.set(x, 0, 0);
        if (dir < 0) mesh.rotation.y = Math.PI;
        group.add(mesh);
        lane.movers.push({ mesh, x, halfWidth });
      }
    } else if (type === LANE_TYPES.RIVER) {
      // Voxel riverbed visible beneath the translucent Voronoi caustics water
      groundBatch.add(stripWidth, 0.14, TILE, 0, -0.34, 0, 0x475569);
      for (let x = -PLAY_HALF_COLS - 2; x <= PLAY_HALF_COLS + 2; x += 2) {
        const stepH = ((Math.abs(x + row) % 3) + 1) * 0.04;
        groundBatch.add(1.35, stepH, 0.72, x, -0.26 + stepH * 0.5, 0, 0x64748b);
      }
      group.add(createWaterStrip(stripWidth, TILE));

      // Either stationary lily pads (no logs) OR drifting logs
      if (Math.random() < 0.38) {
        lane.speed = 0;
        // Guarantee pads in left, center, and right regions so river is always crossable
        const guaranteedCols = [-3, 0, 3];
        for (let c = -PLAY_HALF_COLS; c <= PLAY_HALF_COLS; c++) {
          if (guaranteedCols.includes(c) || Math.random() < 0.34) {
            lane.lilyPads.add(c);
            const pad = createLilyPad(Math.random() < 0.28);
            pad.position.set(c * TILE, pad.userData.baseY, 0);
            group.add(pad);
            lane.lilyPadMeshes.set(c, pad);
          }
        }
      } else {
        // Alternate direction from previous river so crossing feels natural
        const dir = -this.prevRiverDir;
        this.prevRiverDir = dir;
        const diff = Math.min(1.6, 1 + row * 0.005);
        lane.speed = dir * (1.8 + Math.random() * 1.5) * diff;

        const count = 3;
        const span = WRAP_LIMIT * 2;
        const step = span / count;
        const logLen = Math.random() < 0.5 ? 2.8 : 2.3;

        for (let i = 0; i < count; i++) {
          const mesh = createLog(logLen);
          const x = -WRAP_LIMIT + i * step + (Math.random() - 0.5) * 1.2;
          mesh.position.set(x, 0, 0);
          group.add(mesh);
          lane.movers.push({ mesh, x, halfWidth: logLen * 0.5 });
        }
      }
    } else if (type === LANE_TYPES.RAIL) {
      // Gravel bed, ties, rails, and signal post batched into 1 draw call
      groundBatch.add(stripWidth, 0.2, TILE, 0, -0.12, 0, 0x475569);
      for (let x = -VISUAL_HALF_COLS; x <= VISUAL_HALF_COLS; x += 1) {
        groundBatch.add(0.22, 0.03, 0.78, x, 0.0, 0, 0x78350f);
      }
      groundBatch.add(stripWidth, 0.05, 0.1, 0, 0.04, -0.26, 0xcbd5e1);
      groundBatch.add(stripWidth, 0.05, 0.1, 0, 0.04, 0.26, 0xcbd5e1);
      groundBatch.add(0.14, 0.9, 0.14, -PLAY_HALF_COLS - 0.8, 0.45, -0.35, 0x1e293b);
      const warnBulb = addBox(group, 0.22, 0.22, 0.22, -PLAY_HALF_COLS - 0.8, 0.98, -0.35, 0x334155, false);
      lane.trainWarnMesh = warnBulb;

      const gatePivot = new THREE.Group();
      gatePivot.position.set(-PLAY_HALF_COLS - 0.8, 0.55, 0.35);
      addBox(gatePivot, 0.08, 1.5, 0.08, 0, 0.72, 0, 0xef4444, false);
      addBox(gatePivot, 0.09, 0.3, 0.09, 0, 0.9, 0, 0xffffff, false);
      addBox(gatePivot, 0.09, 0.3, 0.09, 0, 0.35, 0, 0xffffff, false);
      group.add(gatePivot);
      lane.trainGate = gatePivot;

      const dir = Math.random() < 0.5 ? 1 : -1;
      const trainMesh = createTrain();
      const startX = dir > 0 ? -WRAP_LIMIT - 8 : WRAP_LIMIT + 8;
      trainMesh.position.set(startX, 0, 0);
      if (dir < 0) trainMesh.rotation.y = Math.PI;
      group.add(trainMesh);

      lane.speed = dir * 24;
      lane.trainPeriod = 5.5 + Math.random() * 3.0;
      lane.trainTimer = Math.random() * lane.trainPeriod;
      lane.train = {
        mesh: trainMesh,
        x: startX,
        halfWidth: 4.3,
        active: false,
      };
    }

    const groundMesh = groundBatch.toMesh(false, true);
    if (groundMesh) {
      group.add(groundMesh);
      lane.disposables.push(groundMesh.geometry);
    }

    return lane;
  }

  triggerRiverSplash(row, x, amount = -0.1, withParticles = true) {
    const lane = this.lanes.get(row);
    if (!lane || lane.type !== LANE_TYPES.RIVER) return;

    if (lane.lilyPads && lane.lilyPads.size > 0) {
      const pad = lane.lilyPadMeshes.get(Math.round(x));
      if (pad) {
        pad.userData.sink = Math.min(pad.userData.sink, amount);
      }
    } else {
      for (const m of lane.movers) {
        if (Math.abs(x - m.x) <= m.halfWidth + 0.16) {
          m.mesh.userData.sink = Math.min(m.mesh.userData.sink || 0, amount);
          break;
        }
      }
    }

    if (withParticles) {
      this.spawnBurst(x, -0.02, -row * TILE, 6, true);
      triggerWaterRipple(x, -row * TILE, this.elapsed);
    }
  }

  update(dt, elapsed) {
    this.elapsed = elapsed;
    updateWaterShader(elapsed);

    // Update lanes
    for (const lane of this.lanes.values()) {
      if (lane.type === LANE_TYPES.ROAD || lane.type === LANE_TYPES.RIVER) {
        for (const m of lane.movers) {
          m.x += lane.speed * dt;
          if (lane.speed > 0 && m.x > WRAP_LIMIT) {
            m.x = -WRAP_LIMIT;
          } else if (lane.speed < 0 && m.x < -WRAP_LIMIT) {
            m.x = WRAP_LIMIT;
          }
          m.mesh.position.x = m.x;
          if (lane.type === LANE_TYPES.RIVER) {
            const baseY = m.mesh.userData.baseY || 0;
            m.mesh.userData.sink = THREE.MathUtils.lerp(m.mesh.userData.sink || 0, 0, Math.min(1, dt * 10));
            m.mesh.position.y = baseY + m.mesh.userData.sink;
          }
        }
        if (lane.type === LANE_TYPES.RIVER && lane.lilyPadMeshes) {
          for (const pad of lane.lilyPadMeshes.values()) {
            pad.userData.sink = THREE.MathUtils.lerp(pad.userData.sink || 0, 0, Math.min(1, dt * 10));
            pad.position.y = pad.userData.baseY + pad.userData.sink;
          }
        }
      } else if (lane.type === LANE_TYPES.RAIL && lane.train) {
        lane.trainTimer += dt;
        const warnTime = lane.trainPeriod - 1.3;
        if (!lane.train.active && lane.trainTimer >= lane.trainPeriod) {
          lane.train.active = true;
          lane.train.x = lane.speed > 0 ? -WRAP_LIMIT - 8 : WRAP_LIMIT + 8;
        }
        if (lane.train.active) {
          lane.train.x += lane.speed * dt;
          lane.train.mesh.position.x = lane.train.x;
          if (
            (lane.speed > 0 && lane.train.x > WRAP_LIMIT + 9) ||
            (lane.speed < 0 && lane.train.x < -WRAP_LIMIT - 9)
          ) {
            lane.train.active = false;
            lane.trainTimer = 0;
          }
        }
        // Flash warning light & lower crossing gate before and during train pass
        const isWarn = lane.train.active || lane.trainTimer >= warnTime;
        if (lane.trainWarnMesh) {
          const flashOn = isWarn && Math.floor(elapsed * 10) % 2 === 0;
          lane.trainWarnMesh.scale.setScalar(flashOn ? 0.28 : 0.2);
          lane.trainWarnMesh.position.y = flashOn ? 1.0 : 0.98;
          lane.trainWarnMesh.material = getMaterial(
            flashOn ? 0xef4444 : 0x334155,
            flashOn ? 0x991b1b : 0x000000
          );
        }
        if (lane.trainGate) {
          const targetRot = isWarn ? -Math.PI / 2 : 0;
          lane.trainGate.rotation.z = THREE.MathUtils.lerp(
            lane.trainGate.rotation.z,
            targetRot,
            Math.min(1, dt * 10)
          );
        }
      }

      // Spin coins
      if (lane.coin && !lane.coin.collected) {
        lane.coin.mesh.rotation.z = elapsed * 3.2;
      }
    }

    // Update particles
    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
        } else {
          p.vy -= 14 * dt;
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          const s = 0.14 * (p.life / p.maxLife);
          p.mesh.scale.setScalar(Math.max(0.02, s));
        }
      }
    }
  }
}
