import { describe, expect, it } from 'vitest';
import { AutoBot } from '../src/bot.js';
import { LANE_TYPES } from '../src/constants.js';

function makeMockWorld(lanesByRow) {
  return {
    getLane(row) {
      return lanesByRow[row] || { type: LANE_TYPES.GRASS, obstacles: new Set() };
    },
  };
}

describe('AutoBot', () => {
  it('hops forward when the lane ahead is clear grass', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      0: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      1: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move).toEqual({ dx: 0, dz: 1 });
  });

  it('sidesteps around a tree blocking the column directly ahead', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      0: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      1: { type: LANE_TYPES.GRASS, obstacles: new Set([0]) },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move.dz).toBe(0);
    expect(Math.abs(move.dx)).toBe(1);
  });

  it('waits when a car is crossing directly in front', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      0: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      1: {
        type: LANE_TYPES.ROAD,
        speed: 4,
        movers: [{ x: 0, halfWidth: 0.8 }],
      },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move).not.toEqual({ dx: 0, dz: 1 });
  });

  it('hops onto a river log when aligned', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      0: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      1: {
        type: LANE_TYPES.RIVER,
        speed: 1.5,
        movers: [{ x: -0.2, halfWidth: 1.4 }],
      },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move).toEqual({ dx: 0, dz: 1 });
  });

  it('steps backward to escape a U-shaped tree pocket', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      [-1]: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      0: { type: LANE_TYPES.GRASS, obstacles: new Set([-1, 1]) },
      1: { type: LANE_TYPES.GRASS, obstacles: new Set([0]) },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      3: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move).toEqual({ dx: 0, dz: -1 });
  });

  it('hops onto a stationary lily pad and avoids water gaps', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      0: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      1: { type: LANE_TYPES.RIVER, speed: 0, lilyPads: new Set([1]), movers: [] },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move).toEqual({ dx: 1, dz: 0 });
  });

  it('detours to collect a nearby coin on safe grass', () => {
    const bot = new AutoBot();
    const world = makeMockWorld({
      0: {
        type: LANE_TYPES.GRASS,
        obstacles: new Set(),
        coin: { col: 1, collected: false },
      },
      1: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      2: { type: LANE_TYPES.GRASS, obstacles: new Set() },
      3: { type: LANE_TYPES.GRASS, obstacles: new Set() },
    });

    const move = bot.decideMove(world, 0, 0);
    expect(move).toEqual({ dx: 1, dz: 0 });
  });
});
