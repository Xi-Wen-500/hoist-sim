/**
 * HoistController.js
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * ── The 9 Interlocks ────────────────────────────────────────────────────────
 *
 *  IL-1  Cross-travel ↔ Lift are mutually exclusive
 *  IL-2  Chain ≥ H1 (9.2m)  → cut lift power
 *  IL-3  Chain ≤ H4 (1.2m)  → cut lower power
 *  IL-4  Position ≤ L4 (3.1m) travelling left  → cut travel
 *  IL-5  Position ≥ L1 (7.8m) travelling right → cut travel
 *  IL-6  E-STOP → all motors stop, reset required
 *  IL-7  Shutter open → travel blocked (all positions)
 *  IL-7a Shutter open AND hoistPos > L2 → ALL manual motion blocked
 *  IL-8  Shutter open → auto-sequence cannot start
 *  IL-9  Chain > H3 AND position > L2 → shutter cannot open
 *
 * ── Collision Zones ─────────────────────────────────────────────────────────
 *
 *  COL-1  Bag hits wall (WALL_X=5m, h=0→4m)
 *  COL-2  Bag hits hopper (TANK_X=3m, h=4→4.9m)
 *  COL-3  Bag hits LVL1 floor (X<5m, Y=4m)
 *  COL-4  Bag hits closed shutter door (X=9.5m, h=0→1.8m)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 */

import {
  H1, H2, H3, H4,
  L1, L2, L3, L4,
  STOPPER_A, STOPPER_B,
  LIFT_SPEED_SLOW, LIFT_SPEED_FAST, TRAVEL_SPEED,
  INITIAL_HOOK_HEIGHT, INITIAL_HOIST_POS,
  BAG_HEIGHT, WALL_X, WALL_HEIGHT, TANK_X, TANK_HEIGHT,
} from '../utils/constants.js';
import { clamp, fmtMetres, bus } from '../utils/mathHelpers.js';

// Bag half-width for collision AABB
const BAG_HW    = 0.46;   // metres
// Shutter door position
const SHUTTER_X = 9.5;
const SHUTTER_H = 1.80;
// Hopper geometry (approximate)
const HOPPER_H  = 0.85;   // hopper body height above TANK_HEIGHT
const HOPPER_HW = 0.52;   // hopper half-width

// Tolerance for limit checks
const EPS = 0.01;

// Default simulation time scale
const DEFAULT_TIME_SCALE = 6;

// ── Sequence definitions ──────────────────────────────────────────────────────

const SEQ_HOME_TO_TANK = [
  { phase: 'lift',   speed: 'slow', target: H3  },
  { phase: 'lift',   speed: 'fast', target: H2  },
  { phase: 'lift',   speed: 'slow', target: H1  },
  { phase: 'travel', dir:   'left', until:  'L4' },
];

const SEQ_TANK_TO_HOME = [
  { phase: 'travel', dir:   'right', until:  'L1' },
  { phase: 'lower',  speed: 'slow',  target: H2  },
  { phase: 'lower',  speed: 'fast',  target: H3  },
  { phase: 'lower',  speed: 'slow',  target: H4  },
];

function stepLabel(step, idx) {
  if (step.phase === 'travel')
    return `Step ${idx + 1}: Travel ${step.dir} to ${step.until}`;
  return `Step ${idx + 1}: ${step.phase === 'lift' ? 'Lift' : 'Lower'} ${step.speed} → ${fmtMetres(step.target)}`;
}

// ══════════════════════════════════════════════════════════════════════════════

export class HoistController {
  constructor() {
    this.hookHeight  = INITIAL_HOOK_HEIGHT;
    this.hoistPos    = INITIAL_HOIST_POS;
    this.mode        = 'manual';
    this.state       = 'idle';
    this.speed       = 'slow';
    this.shutterOpen = false;
    this.eStop       = false;
    this.collision   = null;   // null | { component: string }

    this._cmd = { up: false, down: false, left: false, right: false, fast: false };

    this._seqSteps = [];
    this._seqStep  = 0;
    this._seqDest  = null;

    this.timeScale = DEFAULT_TIME_SCALE;

    bus.on('shutter-toggle',  () => this.toggleShutter());
    bus.on('set-time-scale',  scale => { this.timeScale = scale; });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  setCommand(key, active) {
    if (key in this._cmd) this._cmd[key] = active;
  }

  /** IL-6: Emergency stop. */
  triggerEStop() {
    if (this.eStop) return;
    this.eStop = true;
    this.state = 'estop';
    this._clearCommands();
    this._seqSteps = [];
    this._seqDest  = null;
    this._emitState();
    bus.emit('log', { text: '⚡ EMERGENCY STOP — Reset required', type: 'error' });
  }

  /** Reset after E-Stop. */
  reset() {
    if (!this.eStop) return;
    this.eStop = false;

    if (this.collision) {
      this._log('System reset — returning to home after collision', 'warn');
      this.mode       = 'manual';
      this.hoistPos   = INITIAL_HOIST_POS;
      this.hookHeight = INITIAL_HOOK_HEIGHT;
    } else {
      this._log('System reset — all clear', 'info');
    }

    this.collision = null;
    this.state     = 'idle';
    this.speed     = 'slow';
    this._clearCommands();
    this._emitState();
  }

  setMode(mode) {
    if (this.eStop) return;
    if (this.mode === mode) return;
    this.mode      = mode;
    this.state     = 'idle';
    this._seqSteps = [];
    this._seqDest  = null;
    this._clearCommands();
    this._emitState();
    bus.emit('log', { text: `Mode → ${mode.toUpperCase()}`, type: 'info' });
  }

  startSequence(dest) {
    if (this.eStop)           return this._log('Cannot start — E-Stop active', 'error');
    if (this.mode !== 'auto') return this._log('Switch to AUTO mode first', 'warn');
    if (this.state !== 'idle') return this._log('Sequence already running', 'warn');

    // IL-8
    if (this.shutterOpen) {
      bus.emit('interlock-trigger', { reason: 'shutter-open-no-auto' });
      return this._log('INTERLOCK IL-8: Close shutter before auto-run', 'error');
    }

    if (dest === 'tank') {
      if (!this.isAtHome()) return this._log('Must be at HOME position for Home→Tank sequence', 'warn');
      this._seqSteps = [...SEQ_HOME_TO_TANK];
      this._seqDest  = 'tank';
      this.state     = 'seq-h2t';
    } else {
      if (!this.isAtTank()) return this._log('Must be at TANK position for Tank→Home sequence', 'warn');
      this._seqSteps = [...SEQ_TANK_TO_HOME];
      this._seqDest  = 'home';
      this.state     = 'seq-t2h';
    }

    this._seqStep = 0;
    this._emitState();
    this._log(`AUTO sequence started: ${dest === 'tank' ? 'HOME → TANK' : 'TANK → HOME'}`, 'info');
    this._log(stepLabel(this._seqSteps[0], 0), 'info');
  }

  /** IL-9: Toggle shutter with interlock check. */
  toggleShutter() {
    if (!this.shutterOpen) {
      // Attempting to OPEN
      if (this.hookHeight > H3 + EPS && this.hoistPos > L2 + EPS) {
        bus.emit('interlock-trigger', { reason: 'shutter-blocked' });
        return this._log(
          `INTERLOCK IL-9: Cannot open — load at ${fmtMetres(this.hookHeight)} above H3 on home side`,
          'error',
        );
      }
      if (this.state.startsWith('seq-')) {
        return this._log('Cannot open shutter during auto sequence', 'error');
      }
    }
    this.shutterOpen = !this.shutterOpen;
    this._emitState();
    this._log(
      `Shutter door ${this.shutterOpen ? 'OPEN ⚠' : 'CLOSED ✓'}`,
      this.shutterOpen ? 'warn' : 'info',
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Per-frame update
  // ═══════════════════════════════════════════════════════════════════════════

  update(rawDelta) {
    if (this.eStop) return;

    const delta = rawDelta * this.timeScale;

    if (this.state.startsWith('seq-')) {
      this._updateSequence(delta);
    } else {
      this._updateManual(delta);
    }

    this._enforceHardLimits();
    this._checkCollisions();   // ← collision detection every frame
    this._emitState();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Manual movement
  // ═══════════════════════════════════════════════════════════════════════════

  _updateManual(delta) {
    if (this.mode === 'auto') {
      this._clearCommands();
      this.state = 'idle';
      return;
    }

    // ── IL-7a: Shutter open AND pos > L2 → block ALL manual motion ────────
    if (this.shutterOpen && this.hoistPos > L2 + EPS) {
      if (this._cmd.up || this._cmd.down || this._cmd.left || this._cmd.right) {
        bus.emit('interlock-trigger', { reason: 'shutter-home-zone-locked' });
        this._log('INTERLOCK IL-7a: All motion blocked — shutter open in home zone', 'error');
      }
      this._clearCommands();
      this.state = 'idle';
      this.speed = 'slow';
      return;
    }

    const wantLift   = this._cmd.up   || this._cmd.down;
    const wantTravel = this._cmd.left || this._cmd.right;

    // IL-1: Mutual exclusion
    if (wantLift && wantTravel) {
      bus.emit('interlock-trigger', { reason: 'mutual-exclusion' });
      this.state = 'idle';
      this.speed = 'slow';
      return;
    }

    if (wantLift)        this._doLift(delta);
    else if (wantTravel) this._doTravel(delta);
    else {
      if (this.state !== 'idle') { this.state = 'idle'; this.speed = 'slow'; }
    }
  }

  _doLift(delta) {
    const prevZone   = this._prevSpeedZone ?? null;
    const inFastZone = this.hookHeight >= H3 - EPS && this.hookHeight <= H2 + EPS;
    const useFast    = inFastZone && this._cmd.fast;
    const liftSpeed  = useFast ? LIFT_SPEED_FAST : LIFT_SPEED_SLOW;
    const curZone    = this.speedZone();

    if (prevZone && prevZone !== curZone) {
      const names = { low: 'LOW (slow only)', fast: 'FAST zone', high: 'HIGH (slow only)' };
      this._log(`Speed zone → ${names[curZone]}`, 'info');
    }
    this._prevSpeedZone = curZone;
    this.speed = useFast ? 'fast' : 'slow';

    if (this._cmd.up) {
      if (this.hookHeight >= H1 - EPS) {
        this.hookHeight = H1; this.state = 'idle'; this.speed = 'slow'; return;
      }
      this.hookHeight = Math.min(H1, this.hookHeight + liftSpeed * delta);
      this.state = 'lifting';
    }
    if (this._cmd.down) {
      if (this.hookHeight <= H4 + EPS) {
        this.hookHeight = H4; this.state = 'idle'; this.speed = 'slow'; return;
      }
      this.hookHeight = Math.max(H4, this.hookHeight - liftSpeed * delta);
      this.state = 'lowering';
    }
  }

  _doTravel(delta) {
    // IL-7: Shutter open → no travel at any position
    if (this.shutterOpen) {
      bus.emit('interlock-trigger', { reason: 'shutter-open-no-travel' });
      this._log('INTERLOCK IL-7: Travel blocked — shutter is open', 'error');
      this.state = 'idle'; this.speed = 'slow';
      return;
    }

    this.speed = 'slow';

    if (this._cmd.left) {
      if (this.hoistPos <= L4 + EPS) {
        this.hoistPos = Math.max(STOPPER_A, this.hoistPos);
        if (this.state === 'travelling') {
          bus.emit('limit-hit', { limit: 'L4' });
          this._log(`Cross-travel stopped at L4 (${fmtMetres(L4)})`, 'warn');
        }
        this.state = 'idle'; return;
      }
      this.hoistPos = Math.max(L4, this.hoistPos - TRAVEL_SPEED * delta);
      this.state = 'travelling';
    }

    if (this._cmd.right) {
      if (this.hoistPos >= L1 - EPS) {
        this.hoistPos = Math.min(STOPPER_B, this.hoistPos);
        if (this.state === 'travelling') {
          bus.emit('limit-hit', { limit: 'L1' });
          this._log(`Cross-travel stopped at L1 (${fmtMetres(L1)})`, 'warn');
        }
        this.state = 'idle'; return;
      }
      this.hoistPos = Math.min(L1, this.hoistPos + TRAVEL_SPEED * delta);
      this.state = 'travelling';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto sequence
  // ═══════════════════════════════════════════════════════════════════════════

  _updateSequence(delta) {
    if (this._seqStep >= this._seqSteps.length) {
      this._finishSequence(); return;
    }
    const step = this._seqSteps[this._seqStep];

    if (step.phase === 'lift') {
      const spd = step.speed === 'fast' ? LIFT_SPEED_FAST : LIFT_SPEED_SLOW;
      this.speed      = step.speed;
      this.state      = 'seq-lifting';
      this.hookHeight = Math.min(step.target, this.hookHeight + spd * delta);
      if (this.hookHeight >= H1) this.hookHeight = H1;
      if (this.hookHeight >= step.target - EPS) {
        this.hookHeight = step.target; this._advanceStep();
      }
    }
    else if (step.phase === 'lower') {
      const spd = step.speed === 'fast' ? LIFT_SPEED_FAST : LIFT_SPEED_SLOW;
      this.speed      = step.speed;
      this.state      = 'seq-lowering';
      this.hookHeight = Math.max(step.target, this.hookHeight - spd * delta);
      if (this.hookHeight <= H4) this.hookHeight = H4;
      if (this.hookHeight <= step.target + EPS) {
        this.hookHeight = step.target; this._advanceStep();
      }
    }
    else if (step.phase === 'travel') {
      if (this.shutterOpen) {
        this._log('INTERLOCK IL-7: Shutter opened during auto-travel → E-Stop', 'error');
        this.triggerEStop(); return;
      }
      this.speed     = 'slow';
      this.state     = 'seq-travelling';
      const dir      = step.dir === 'left' ? -1 : 1;
      this.hoistPos  = clamp(this.hoistPos + dir * TRAVEL_SPEED * delta, STOPPER_A, STOPPER_B);

      const stopVal = step.until === 'L4' ? L4 : L1;
      const reached = step.dir === 'left'
        ? this.hoistPos <= stopVal + EPS
        : this.hoistPos >= stopVal - EPS;

      if (reached) { this.hoistPos = stopVal; this._advanceStep(); }
    }
  }

  _advanceStep() {
    this._clearCommands();
    this._seqStep++;
    if (this._seqStep < this._seqSteps.length)
      this._log(stepLabel(this._seqSteps[this._seqStep], this._seqStep), 'info');
  }

  _finishSequence() {
    const dest     = this._seqDest === 'tank' ? 'TANK' : 'HOME';
    this.state     = 'idle';
    this.speed     = 'slow';
    this._seqSteps = [];
    this._seqDest  = null;
    bus.emit('sequence-complete', { destination: dest });
    this._log(`✓ Sequence complete — hoist at ${dest}`, 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Collision detection  (AABB — bag vs static obstacles)
  // ═══════════════════════════════════════════════════════════════════════════

  _checkCollisions() {
    const x   = this.hoistPos;
    const yLo = this.hookHeight;           // bag bottom
    const yHi = yLo + BAG_HEIGHT;         // bag top
    const xLo = x - BAG_HW;
    const xHi = x + BAG_HW;

    let hit = null;

    // COL-1: Wall — vertical plane at WALL_X, height 0 → WALL_HEIGHT
    if (xLo < WALL_X + 0.08 && xHi > WALL_X - 0.08 && yLo < WALL_HEIGHT - 0.05) {
      hit = 'WALL';
    }

    // COL-2: Tipping hopper — centred at TANK_X, base at TANK_HEIGHT
    if (!hit) {
      const hopXlo = TANK_X - HOPPER_HW;
      const hopXhi = TANK_X + HOPPER_HW;
      const hopYlo = TANK_HEIGHT;
      const hopYhi = TANK_HEIGHT + HOPPER_H;
      if (xHi > hopXlo && xLo < hopXhi && yHi > hopYlo && yLo < hopYhi) {
        hit = 'HOPPER';
      }
    }

    // COL-3: LVL1 floor — at WALL_HEIGHT (4m), X < WALL_X
    if (!hit && xLo < WALL_X - 0.1 && yHi > WALL_HEIGHT - 0.05 && yLo < WALL_HEIGHT) {
      hit = 'LVL1-FLOOR';
    }

    // COL-4: Shutter door — at SHUTTER_X, height 0 → SHUTTER_H, only when CLOSED
    if (!hit && !this.shutterOpen) {
      if (xHi > SHUTTER_X - 0.1 && xLo < SHUTTER_X + 0.1 && yLo < SHUTTER_H - 0.05) {
        hit = 'SHUTTER-DOOR';
      }
    }

    if (hit && !this.eStop) {
      this.collision = { component: hit };
      bus.emit('collision', { component: hit });
      bus.emit('log', {
        text: `⚠ COLLISION ALARM — Bag hit ${hit} at pos=${fmtMetres(x)} ht=${fmtMetres(yLo)}`,
        type: 'error',
      });
      this.triggerEStop();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Hard limit enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  _enforceHardLimits() {
    if (this.hookHeight > H1) {
      this.hookHeight = H1;
      if (this.state === 'lifting') {
        this.state = 'idle'; this.speed = 'slow';
        bus.emit('limit-hit', { limit: 'H1' });
      }
    }
    if (this.hookHeight < H4) {
      this.hookHeight = H4;
      if (this.state === 'lowering') {
        this.state = 'idle'; this.speed = 'slow';
        bus.emit('limit-hit', { limit: 'H4' });
      }
    }
    if (this.hoistPos < STOPPER_A) {
      this.hoistPos = STOPPER_A;
      if (this.state === 'travelling') {
        this.state = 'idle'; bus.emit('limit-hit', { limit: 'STOPPER_A' });
      }
    }
    if (this.hoistPos > STOPPER_B) {
      this.hoistPos = STOPPER_B;
      if (this.state === 'travelling') {
        this.state = 'idle'; bus.emit('limit-hit', { limit: 'STOPPER_B' });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Position checks
  // ═══════════════════════════════════════════════════════════════════════════

  isAtHome() {
    return (
      this.hookHeight >= H4 - EPS && this.hookHeight <= H3 + EPS &&
      this.hoistPos   >= L1 - EPS
    );
  }

  isAtTank() {
    return (
      this.hookHeight >= H1 - EPS &&
      this.hoistPos   <= L4 + EPS
    );
  }

  speedZone() {
    if (this.hookHeight < H3) return 'low';
    if (this.hookHeight > H2) return 'high';
    return 'fast';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  _clearCommands() {
    Object.keys(this._cmd).forEach(k => { this._cmd[k] = false; });
  }

  _log(text, type = 'info') {
    bus.emit('log', { text, type });
  }

  _emitState() {
    bus.emit('state-change', this._snapshot());
  }

  _snapshot() {
    return {
      hookHeight:  this.hookHeight,
      hoistPos:    this.hoistPos,
      mode:        this.mode,
      state:       this.state,
      speed:       this.speed,
      speedZone:   this.speedZone(),
      shutterOpen: this.shutterOpen,
      eStop:       this.eStop,
      collision:   this.collision,
      atHome:      this.isAtHome(),
      atTank:      this.isAtTank(),
      seqStep:     this._seqStep,
      seqTotal:    this._seqSteps.length,
      timeScale:   this.timeScale,
    };
  }
}
