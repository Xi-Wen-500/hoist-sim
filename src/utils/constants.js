/**
 * constants.js
 * Single source of truth for all hoist system parameters.
 * All distances in metres. Speeds in metres per second.
 */

// ── Scene geometry ──────────────────────────────────────────────────────────
export const BEAM_LENGTH = 9.0;   // metres
export const BEAM_HEIGHT = 10.0;  // metres above ground
export const BEAM_ORIGIN_X = 0.0;   // world-space X of beam left end

export const WALL_X = 5.0;   // metres from beam origin
export const WALL_HEIGHT = 4.0;   // metres (ground → LVL1 floor)

export const TANK_X = 3.0;   // metres from beam origin
export const TANK_HEIGHT = 4.0;   // metres (base from ground)
export const HOME_X = 8.0;   // metres from beam origin (big bag park)

// ── Mechanical stoppers ─────────────────────────────────────────────────────
export const STOPPER_A = 2.9;   // metres — left end limit
export const STOPPER_B = 8.1;   // metres — right end limit

// ── Lifting limit switch heights (H1 > H2 > H3 > H4) ────────────────────────
export const H1 = 7.8;   // upper limit (cut lift power) to prevent bag hitting beam (7.8 + 1.4 = 9.2m < hoist bounds)
export const H2 = 6.8;   // slow→fast / fast→slow transition
export const H3 = 1.8;   // fast→slow transition (lower)
export const H4 = 1.2;   // lower limit (cut lower power)
export const HOOK_MAX_HEIGHT = 8.0;   // physical max hook travel

// ── Cross-travel limit switch triggers (L1 > L2 > L3 > L4) ─────────────────
export const L1 = 7.8;   // rightmost trigger (near home)
export const L2 = 5.5;
export const L3 = 4.0;
export const L4 = 3.1;   // leftmost trigger (near tank)

// ── Home / Tank position definitions ────────────────────────────────────────
export const HOME_POSITION = {
  chainMin: H4,
  chainMax: H3,
  beamMin: L1,           // hoist position must be >= L1
};
export const TANK_POSITION = {
  chainMin: H1,           // chain must be > H1
  beamMax: L4,           // hoist position must be <= L4
};

// ── Big bag ─────────────────────────────────────────────────────────────────
export const BAG_HEIGHT_MIN = 1.2;   // metres (on pallet)
export const BAG_HEIGHT_MAX = 1.6;   // metres (on pallet)
export const BAG_HEIGHT = 1.4;   // nominal height used in simulation

// ── Motor speeds (metres per second) ────────────────────────────────────────
// Real world: slow ~1 m/min → ~0.0167 m/s, fast ~4 m/min → ~0.0667 m/s
export const LIFT_SPEED_SLOW = 2 / 60;   // m/s (~1 m/min)
export const LIFT_SPEED_FAST = 8 / 60;   // m/s (~4 m/min)
export const TRAVEL_SPEED = 5 / 60;   // m/s — cross travel is single speed

// ── Initial state ────────────────────────────────────────────────────────────
export const INITIAL_HOOK_HEIGHT = 1.5;   // metres — within HOME band
export const INITIAL_HOIST_POS = 8.0;   // metres — at HOME X

// ── Camera / renderer ────────────────────────────────────────────────────────
export const CAMERA_FRUSTUM_SIZE = 14;    // orthographic frustum height (m)
export const ZOOM_MIN = 0.5;   // 50 % of screen
export const ZOOM_MAX = 10.0;  // 1000% of screen

// ── Colours (mirrored from CSS for Three.js meshes) ─────────────────────────
export const COLOR = {
  BEAM: 0x818589,
  BEAM_EDGE: 0x4fc3f7,
  HOIST: 0x101d2a,
  HOIST_EDGE: 0x4fc3f7,
  CHAIN: 0xbfa463,
  HOOK: 0xf0a500,
  BIG_BAG: 0xcfbba9,
  BIG_BAG_E: 0x1e2475,
  TANK: 0xCCCED1,
  TANK_E: 0x00173b,
  WALL: 0xE3D9C6,
  WALL_E: 0xffffff,
  GROUND: 0x808080,
  STOPPER: 0xff5252,
  TRIGGER: 0xf0a500,
  HIGHLIGHT: 0xffffff,
  SHUTTER: 0x3734ed,
};

// ── Scene background colours ────────────────────────────────────────────────
export const BG_COLORS = {
  'dark-grey': 0x2a2a2f,
  'midnight-blue': 0x0f1729,
  'cream': 0xf5f0e8,
  'beige': 0xd4c5a9,
};
export const DEFAULT_BG = 'dark-grey';
