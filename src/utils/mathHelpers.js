/**
 * mathHelpers.js
 * Shared math / conversion utilities.
 */

/** Linear interpolation */
export function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Clamp a value between min and max */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a metre value along the beam to Three.js world-space X.
 * Beam origin (0m) sits at worldX = -BEAM_LENGTH/2 in centred scenes,
 * but we set origin at x=0 and extend right, so worldX === metrePos.
 */
export function beamMetreToWorldX(metres) {
  return metres; // 1:1 scale; adjust if scene is re-centred
}

/**
 * Convert a height in metres to Three.js world-space Y.
 * Ground = y=0.
 */
export function heightToWorldY(metres) {
  return metres; // 1:1 scale
}

/** Round to N decimal places */
export function round(value, decimals = 2) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

/** Format metres for display: "8.00m" */
export function fmtMetres(value) {
  return `${round(value, 2).toFixed(2)}m`;
}

/** Simple event emitter for decoupled system comms */
export class EventBus {
  constructor() { this._listeners = {}; }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}

/** Global event bus instance — import this wherever needed */
export const bus = new EventBus();
