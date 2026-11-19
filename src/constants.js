export const TILE = 1;
export const PLAY_HALF_COLS = 6; // Playable x in [-6, +6]
export const VISUAL_HALF_COLS = 15; // Visual strip width
export const LANES_BEHIND = 7;
export const LANES_AHEAD = 21;

export const HOP_DURATION = 0.145; // Seconds per hop
export const HOP_HEIGHT = 0.52;
export const AI_STEP_DELAY = 0.24; // Chill pause between hops on safe tiles
export const WRAP_LIMIT = 19; // X coordinate where vehicles/logs wrap around

export const LANE_TYPES = {
  GRASS: 'grass',
  ROAD: 'road',
  RIVER: 'river',
  RAIL: 'rail',
};

export const SPEEDS = [0.7, 1.0, 1.5, 2.2];
