/**
 * InteractionSystem.js  — Section 4: Interaction Rules
 *
 * Controls:
 *   W/A/S/D  — lift up / travel left / lower / travel right
 *   Shift    — fast speed (lift only; cross-travel always slow)
 *   Space    — E-Stop (prevents all motion, requires reset)
 *   Enter    — Reset after E-Stop
 *
 * Feedback:
 *   - D-pad buttons light up when the matching keyboard key is held
 *   - Mutual exclusion (lift + travel simultaneously) shows interlock flash
 *   - Speed badge updates in HUD: SLOW / FAST
 *   - E-Stop: all controls locked, sidebar dims, pulsing red overlay
 *   - Controls-mode toggle: keyboard vs on-screen only
 */

import * as THREE   from 'three';
import { bus }      from '../utils/mathHelpers.js';

// Maps keyboard code → dpad action
const KEY_ACTION = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
const KEY_SPEED  = new Set(['ShiftLeft', 'ShiftRight']);

export class InteractionSystem {
  constructor(canvas, controller, sceneManager, cameraManager) {
    this._canvas  = canvas;
    this._ctrl    = controller;
    this._scene   = sceneManager;
    this._camera  = cameraManager;

    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();
    this._clickable = null;   // lazy

    this._kbEnabled      = true;
    this._onscreenEnabled = true;

    // Track which actions are currently commanded (for mutual-exclusion check)
    this._activeActions = new Set();
    this._fast          = false;
    this._autoMode      = false;   // true when mode=auto; blocks manual WASD

    // DOM refs cached after first bind
    this._dpadBtns = {};   // action → button element
    this._speedBadge = null;

    this._bindKeyboard();
    this._bindOnscreen();
    this._bindRaycast();
    this._bindBusListeners();

    // Initial speed badge
    this._updateSpeedBadge();
  }

  // ── Bus listeners ────────────────────────────────────────────────────────────

  _bindBusListeners() {
    bus.on('state-change', snap => {
      this._syncEStopVisual(snap.eStop);
      this._syncModeButtons(snap.mode);

      // ── Auto-sequence buttons ──────────────────────────────────────────
      // Only enabled when: mode=auto AND not e-stopped AND not already running
      // AND hoist is at the correct starting position.
      const tankBtn  = document.getElementById('btn-goto-tank');
      const homeBtn  = document.getElementById('btn-goto-home');
      const inAuto   = snap.mode === 'auto';
      const seqBusy  = snap.state.startsWith('seq-') || snap.eStop;
      if (tankBtn) tankBtn.disabled = !inAuto || seqBusy || !snap.atHome;
      if (homeBtn) homeBtn.disabled = !inAuto || seqBusy || !snap.atTank;

      // ── Block manual WASD input when in auto mode ──────────────────────
      this._autoMode = snap.mode === 'auto';
    });

    bus.on('interlock-trigger', ({ reason }) => {
      this._flashInterlock(reason);
    });

    bus.on('log', ({ text, type }) => {
      // forward to speed badge if it's a speed event
      if (text.includes('FAST') || text.includes('SLOW')) this._updateSpeedBadge();
    });
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  _bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (!this._kbEnabled) return;

      // E-Stop and Reset always work regardless of mode
      if (e.code === 'Space') { e.preventDefault(); this._ctrl.triggerEStop(); return; }
      if (e.code === 'Enter') { this._ctrl.reset(); return; }

      // In auto mode, all manual movement keys are ignored
      if (this._autoMode) return;

      // Speed modifier
      if (KEY_SPEED.has(e.code)) {
        if (!this._fast) {
          this._fast = true;
          this._ctrl.setCommand('fast', true);
          this._updateSpeedBadge();
        }
        return;
      }

      const action = KEY_ACTION[e.code];
      if (!action || this._activeActions.has(action)) return;

      // Mutual exclusion check
      if (this._wouldConflict(action)) {
        this._flashInterlock('mutual-exclusion');
        bus.emit('log', { text: 'INTERLOCK: Cannot lift and travel simultaneously', type: 'error' });
        return;
      }

      this._activeActions.add(action);
      this._ctrl.setCommand(action, true);
      this._pressDpadBtn(action, true);
      this._updateSpeedBadge();
    });

    window.addEventListener('keyup', e => {
      if (KEY_SPEED.has(e.code)) {
        this._fast = false;
        this._ctrl.setCommand('fast', false);
        this._updateSpeedBadge();
        return;
      }
      const action = KEY_ACTION[e.code];
      if (!action) return;
      this._activeActions.delete(action);
      this._ctrl.setCommand(action, false);
      this._pressDpadBtn(action, false);
      this._updateSpeedBadge();
    });
  }

  // ── On-screen D-Pad ──────────────────────────────────────────────────────────

  _bindOnscreen() {
    // Cache all dpad buttons
    document.querySelectorAll('.dpad__btn').forEach(btn => {
      const action = btn.dataset.action;
      if (action && action !== 'stop') this._dpadBtns[action] = btn;

      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!this._onscreenEnabled) return;
        // In auto mode, only the stop button works
        if (this._autoMode && action !== 'stop') return;

        if (action === 'stop') {
          this._ctrl.triggerEStop(); return;
        }

        if (this._wouldConflict(action)) {
          this._flashInterlock('mutual-exclusion');
          bus.emit('log', { text: 'INTERLOCK: Cannot lift and travel simultaneously', type: 'error' });
          return;
        }

        this._activeActions.add(action);
        this._ctrl.setCommand(action, true);
        btn.classList.add('dpad__btn--pressed');
        this._updateSpeedBadge();
      });

      const release = () => {
        if (action && action !== 'stop') {
          this._activeActions.delete(action);
          this._ctrl.setCommand(action, false);
          btn.classList.remove('dpad__btn--pressed');
          this._updateSpeedBadge();
        }
      };
      btn.addEventListener('pointerup',    release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('pointercancel', release);
    });

    // Mode toggle
    document.getElementById('btn-mode-manual')?.addEventListener('click', () => {
      this._ctrl.setMode('manual');
    });
    document.getElementById('btn-mode-auto')?.addEventListener('click', () => {
      this._ctrl.setMode('auto');
    });

    // Sequence buttons
    document.getElementById('btn-goto-tank')?.addEventListener('click', () => {
      this._ctrl.startSequence('tank');
    });
    document.getElementById('btn-goto-home')?.addEventListener('click', () => {
      this._ctrl.startSequence('home');
    });

    // E-Stop / Reset in footer
    document.getElementById('btn-estop')?.addEventListener('click', () => this._ctrl.triggerEStop());
    document.getElementById('btn-reset')?.addEventListener('click',  () => this._ctrl.reset());

    // Controls-mode toggle (keyboard ↔ on-screen) - removed
  }

  // ── Mutual exclusion helper ───────────────────────────────────────────────────

  _wouldConflict(action) {
    const isLift   = action === 'up'   || action === 'down';
    const isTravel = action === 'left' || action === 'right';
    const hasLift  = this._activeActions.has('up')   || this._activeActions.has('down');
    const hasTravel= this._activeActions.has('left') || this._activeActions.has('right');
    return (isLift && hasTravel) || (isTravel && hasLift);
  }

  // ── Sync mode buttons & panel visibility ─────────────────────────────────────

  _syncModeButtons(mode) {
    document.getElementById('btn-mode-manual')?.classList.toggle('mode-btn--active', mode === 'manual');
    document.getElementById('btn-mode-auto')?.classList.toggle('mode-btn--active',   mode === 'auto');
    const manualDiv = document.getElementById('manual-controls');
    const autoDiv   = document.getElementById('auto-controls');
    if (manualDiv) manualDiv.style.display = mode === 'manual' ? '' : 'none';
    if (autoDiv)   autoDiv.style.display   = mode === 'auto'   ? '' : 'none';
  }

  // ── D-pad visual press (keyboard → button) ───────────────────────────────────

  _pressDpadBtn(action, active) {
    const btn = this._dpadBtns[action];
    if (!btn) return;
    btn.classList.toggle('dpad__btn--pressed', active);
  }

  // ── Speed badge ───────────────────────────────────────────────────────────────

  _updateSpeedBadge() {
    const fast = this._fast &&
      (this._activeActions.has('up') || this._activeActions.has('down'));

    // HUD badge
    let badge = document.getElementById('hud-speed-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'hud-speed-badge';
      badge.style.cssText = `
        display:flex;align-items:center;gap:5px;padding:3px 8px;
        border-radius:2px;border:1px solid var(--border);
        background:var(--panel-deep);font-family:var(--font-mono);
        font-size:9px;letter-spacing:0.5px;
      `;
      document.getElementById('hud-bar')?.appendChild(badge);
    }
    badge.style.borderColor  = fast ? 'var(--amber-dim)' : 'var(--border)';
    badge.style.color        = fast ? 'var(--amber)' : 'var(--text-dim)';
    badge.textContent        = fast ? '⚡ FAST' : '— SLOW';
  }

  // ── E-Stop visual lock ────────────────────────────────────────────────────────

  _syncEStopVisual(eStop) {
    // Dim/disable dpad buttons
    const dpad = document.getElementById('manual-controls');
    if (dpad) dpad.style.opacity = eStop ? '0.3' : '1';
    const auto = document.getElementById('auto-controls');
    if (auto) auto.style.opacity = eStop ? '0.3' : '1';

    // Clear any pressed states when E-Stopped
    if (eStop) {
      this._activeActions.clear();
      this._fast = false;
      Object.values(this._dpadBtns).forEach(b => b.classList.remove('dpad__btn--pressed'));
      this._updateSpeedBadge();
    }

    // Canvas overlay tint
    let overlay = document.getElementById('estop-overlay');
    if (eStop && !overlay) {
      overlay = document.createElement('div');
      overlay.id = 'estop-overlay';
      overlay.style.cssText = `
        position:fixed;inset:0;pointer-events:none;z-index:55;
        background:rgba(232,54,42,0.06);
        animation:estop-overlay-pulse 0.8s ease-in-out infinite;
      `;
      document.body.appendChild(overlay);
      // inject keyframes if not already present
      if (!document.getElementById('estop-overlay-kf')) {
        const s = document.createElement('style');
        s.id = 'estop-overlay-kf';
        s.textContent = `@keyframes estop-overlay-pulse {
          0%,100%{background:rgba(232,54,42,0.04)}
          50%{background:rgba(232,54,42,0.12)}
        }`;
        document.head.appendChild(s);
      }
    } else if (!eStop && overlay) {
      overlay.remove();
    }
  }

  // ── Interlock flash ───────────────────────────────────────────────────────────

  _flashInterlock(reason) {
    let flash = document.getElementById('interlock-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'interlock-flash';
      flash.style.cssText = `
        position:fixed;bottom:76px;
        left:50%;transform:translateX(-50%);
        padding:5px 16px;border-radius:3px;
        background:rgba(232,54,42,0.92);
        color:#fff;font-family:var(--font-ui);
        font-weight:700;font-size:10px;letter-spacing:1.5px;
        text-transform:uppercase;pointer-events:none;
        z-index:300;opacity:0;transition:opacity 0.1s;
      `;
      document.body.appendChild(flash);
    }

    const LABELS = {
      'mutual-exclusion': 'INTERLOCK — Lift & Travel Simultaneous',
      'shutter-blocked':  'INTERLOCK — Shutter Cannot Open (Load Above)',
      'default':          'INTERLOCK — Action Blocked',
    };
    flash.textContent = LABELS[reason] ?? LABELS.default;
    flash.style.opacity = '1';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { flash.style.opacity = '0'; }, 1800);
  }

  // ── Raycasting ────────────────────────────────────────────────────────────────

  _bindRaycast() {
    this._canvas.addEventListener('pointerup', e => {
      if (e.button !== 0) return;
      if (!this._camera.consumedAsClick) return;

      this._updateMouse(e);
      const clickMap = this._getClickMap();
      const meshes   = [...clickMap.keys()];

      this._raycaster.setFromCamera(this._mouse, this._camera.camera);
      const hits = this._raycaster.intersectObjects(meshes, false);

      if (hits.length > 0) {
        const name = clickMap.get(hits[0].object);
        bus.emit('object-clicked', { name });
        this._scene.setHighlight(name);
      } else {
        bus.emit('object-clicked', { name: null });
        this._scene.setHighlight(null);
      }
    });
  }

  _updateMouse(e) {
    const r = this._canvas.getBoundingClientRect();
    this._mouse.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
    this._mouse.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
  }

  _getClickMap() {
    if (!this._clickable) this._clickable = this._scene.getClickableObjects();
    return this._clickable;
  }
}
