import {
  AI_STEP_DELAY,
  HOP_DURATION,
  LANE_TYPES,
  PLAY_HALF_COLS,
  WRAP_LIMIT,
} from './constants.js';

function wrapX(x, speed, dt) {
  let nx = x + speed * dt;
  if (speed > 0 && nx > WRAP_LIMIT) {
    nx = -WRAP_LIMIT + (nx - WRAP_LIMIT);
  } else if (speed < 0 && nx < -WRAP_LIMIT) {
    nx = WRAP_LIMIT + (nx + WRAP_LIMIT);
  }
  return nx;
}

function isPointSafe(world, x, row, timeStart, timeEnd) {
  const col = Math.round(x);
  if (Math.abs(col) > PLAY_HALF_COLS) return false;

  const lane = world.getLane(row);
  if (!lane) return false;

  if (lane.type === LANE_TYPES.GRASS) {
    return !lane.obstacles.has(col);
  }

  if (lane.type === LANE_TYPES.ROAD) {
    const playerHalf = 0.34;
    const t0 = Math.max(0, timeStart - 0.02);
    const samples = 5;
    for (let s = 0; s <= samples; s++) {
      const t = t0 + ((timeEnd - t0) * s) / samples;
      for (const m of lane.movers) {
        const mx = wrapX(m.x, lane.speed, t);
        if (Math.abs(x - mx) < m.halfWidth + playerHalf) {
          return false;
        }
      }
    }
    return true;
  }

  if (lane.type === LANE_TYPES.RIVER) {
    if (lane.lilyPads && lane.lilyPads.size > 0) {
      return lane.lilyPads.has(col);
    }
    for (const m of lane.movers || []) {
      const mx = wrapX(m.x, lane.speed, timeStart);
      if (Math.abs(x - mx) <= m.halfWidth - 0.2) {
        const futureX = x + lane.speed * Math.max(0.24, timeEnd - timeStart);
        if (Math.abs(futureX) <= PLAY_HALF_COLS - 0.2) {
          return true;
        }
      }
    }
    return false;
  }

  if (lane.type === LANE_TYPES.RAIL) {
    if (!lane.train) return true;
    const samples = 3;
    for (let s = 0; s <= samples; s++) {
      const t = timeStart + ((timeEnd - timeStart) * s) / samples;
      if (lane.train.active) {
        const tx = lane.train.x + lane.speed * t;
        if (Math.abs(x - tx) < lane.train.halfWidth + 2.6) return false;
      }
      if (lane.trainTimer + t >= lane.trainPeriod - 1.45) {
        return false;
      }
    }
    return true;
  }

  return true;
}

function isSafeRestingTile(world, row) {
  const lane = world.getLane(row);
  if (!lane) return false;
  if (lane.type === LANE_TYPES.GRASS) return true;
  if (lane.type === LANE_TYPES.RIVER && lane.lilyPads && lane.lilyPads.size > 0) return true;
  return false;
}

export class AutoBot {
  constructor() {
    this.lastDx = 0;
    this.waitStreak = 0;
  }

  reset() {
    this.lastDx = 0;
    this.waitStreak = 0;
  }

  decideMove(world, playerX, playerRow, minAllowedRow = playerRow - 4) {
    const MAX_DEPTH = 6;
    const MAX_NODES = 160;
    const WAIT_DT = 0.14;

    const actions = [
      { dx: 0, dz: 1 },   // Forward
      { dx: -1, dz: 0 },  // Left
      { dx: 1, dz: 0 },   // Right
      { dx: 0, dz: 0 },   // Wait
      { dx: 0, dz: -1 },  // Back
    ];

    const startLane = world.getLane(playerRow);
    const startSafeRest = isSafeRestingTile(world, playerRow);

    // Find nearest uncollected coin in the next few rows to attract paths toward it
    let targetCoin = null;
    for (let r = playerRow; r <= playerRow + 4; r++) {
      const l = world.getLane(r);
      if (l?.coin && !l.coin.collected) {
        if (!targetCoin || Math.abs(l.coin.col - playerX) < Math.abs(targetCoin.col - playerX)) {
          targetCoin = { row: r, col: l.coin.col };
        }
      }
    }

    const frontier = [
      {
        x: playerX,
        row: playerRow,
        t: 0,
        depth: 0,
        firstMove: null,
        coins: 0,
        collectedKey: '',
        score: 0,
      },
    ];
    const visited = new Set([`${Math.round(playerX)},${playerRow},0`]);

    let bestTerminal = null;
    let expanded = 0;

    while (frontier.length > 0 && expanded < MAX_NODES) {
      // Pick highest heuristic state (lightweight beam/best-first search)
      let bestIdx = 0;
      for (let i = 1; i < frontier.length; i++) {
        if (frontier[i].score > frontier[bestIdx].score) bestIdx = i;
      }
      const cur = frontier.splice(bestIdx, 1)[0];
      expanded++;

      if (cur.firstMove) {
        const endSafe = isSafeRestingTile(world, cur.row) ? 26 : -14;
        const evalScore =
          (cur.row - playerRow) * 100 +
          endSafe +
          cur.coins * 115 -
          Math.abs(cur.x) * 1.8 -
          cur.depth * 2.2;
        if (!bestTerminal || evalScore > bestTerminal.evalScore) {
          bestTerminal = { firstMove: cur.firstMove, evalScore };
        }
        // Early exit if we found a clean multi-row advance onto a safe resting tile (with no nearby coin missed)
        if (
          cur.row >= playerRow + 4 &&
          isSafeRestingTile(world, cur.row) &&
          (!targetCoin || cur.coins > 0)
        ) {
          break;
        }
      }

      if (cur.depth >= MAX_DEPTH) continue;

      const curLane = world.getLane(cur.row);
      const curIsRiverLog =
        curLane?.type === LANE_TYPES.RIVER &&
        !(curLane.lilyPads && curLane.lilyPads.size > 0);
      const baseCol = Math.round(cur.x);

      for (const act of actions) {
        const isWait = act.dx === 0 && act.dz === 0;
        const nextRow = cur.row + act.dz;
        if (nextRow < minAllowedRow) continue;

        let nextX;
        let tArrive;
        let nextT;

        if (isWait) {
          tArrive = cur.t;
          nextT = cur.t + WAIT_DT;
          nextX = curIsRiverLog ? cur.x + curLane.speed * WAIT_DT : cur.x;
          if (!isPointSafe(world, nextX, nextRow, cur.t, nextT + 0.14)) {
            continue;
          }
        } else {
          nextX = baseCol + act.dx;
          tArrive = cur.t + HOP_DURATION;
          const nextSafe = isSafeRestingTile(world, nextRow);
          nextT = tArrive + (nextSafe ? AI_STEP_DELAY : 0.02);

          if (!isPointSafe(world, nextX, nextRow, tArrive, tArrive + 0.16)) {
            continue;
          }
        }

        const timeBucket = Math.round(nextT / 0.14);
        const key = `${Math.round(nextX)},${nextRow},${timeBucket}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const nextLane = world.getLane(nextRow);
        let coinGain = 0;
        let nextCollectedKey = cur.collectedKey;
        if (
          !isWait &&
          nextLane?.coin &&
          !nextLane.coin.collected &&
          nextLane.coin.col === Math.round(nextX)
        ) {
          const cKey = `${nextRow},${nextLane.coin.col}`;
          if (!cur.collectedKey.includes(cKey)) {
            coinGain = 1;
            nextCollectedKey = cur.collectedKey ? `${cur.collectedKey};${cKey}` : cKey;
          }
        }

        const coinAlignBonus =
          targetCoin && nextRow <= targetCoin.row
            ? Math.max(0, 18 - Math.abs(nextX - targetCoin.col) * 4.5)
            : 0;

        const firstMove = cur.firstMove || act;
        let hScore =
          (nextRow - playerRow) * 100 +
          (isSafeRestingTile(world, nextRow) ? 20 : -8) +
          (cur.coins + coinGain) * 115 +
          coinAlignBonus -
          Math.abs(nextX) * 1.8 -
          (cur.depth + 1) * 2.2;

        // Slight penalty for oscillating opposite to last horizontal move
        if (!cur.firstMove && act.dx !== 0 && act.dx === -this.lastDx) {
          hScore -= 12;
        }
        // Discourage waiting if already on a dangerous lane or waiting too long
        if (!cur.firstMove && isWait && (!startSafeRest || this.waitStreak > 4)) {
          hScore -= 24;
        }
        // Slight penalty for stepping back unless it unlocks forward progress
        if (!cur.firstMove && act.dz < 0) {
          hScore -= 10;
        }

        frontier.push({
          x: nextX,
          row: nextRow,
          t: nextT,
          depth: cur.depth + 1,
          firstMove,
          coins: cur.coins + coinGain,
          collectedKey: nextCollectedKey,
          score: hScore,
        });
      }
    }

    let chosen = bestTerminal ? bestTerminal.firstMove : null;

    // Emergency 1-step fallback if space-time search found no multi-step plan
    if (!chosen) {
      for (const act of actions) {
        const nextRow = playerRow + act.dz;
        if (nextRow < minAllowedRow) continue;
        const isWait = act.dx === 0 && act.dz === 0;
        const nextX = isWait ? playerX : Math.round(playerX) + act.dx;
        const tA = isWait ? 0 : HOP_DURATION;
        if (isPointSafe(world, nextX, nextRow, tA, tA + 0.14)) {
          chosen = act;
          break;
        }
      }
    }

    if (!chosen) {
      chosen = { dx: 0, dz: 0 };
    }

    if (chosen.dx === 0 && chosen.dz === 0) {
      this.waitStreak++;
    } else {
      this.waitStreak = 0;
      this.lastDx = chosen.dx;
    }

    return { dx: chosen.dx, dz: chosen.dz };
  }
}
