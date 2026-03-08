/**
 * UIController.js
 * Listens to EventBus and updates all DOM elements to reflect hoist state.
 * Also owns sidebar collapse, settings, theme, CLI log.
 */

import { bus, fmtMetres } from '../utils/mathHelpers.js';
import { BG_COLORS }      from '../utils/constants.js';

const FONT_SCALES = [0.85, 0.9, 1.0, 1.15, 1.3, 1.5];

export class UIController {
  /**
   * @param {RendererManager} rendererManager
   * @param {CameraManager}   cameraManager
   * @param {SceneManager}    sceneManager
   */
  constructor(rendererManager, cameraManager, sceneManager) {
    this._renderer = rendererManager;
    this._camera   = cameraManager;
    this._scene    = sceneManager;

    this._cliEnabled   = true;
    this._sidebarSide  = 'right';  // 'left' | 'right'
    this._theme        = 'dark';
    this._fontSize     = 2;        // index into FONT_SIZES

    this._logQueue     = [];
    this._MAX_LOG      = 6;

    this._bindSidebar();
    this._bindSettings();
    this._bindAccordion();
    this._bindInspectPanel();
    this._listenBus();

    // Apply initial body classes
    document.body.classList.add('sidebar-right');

    this._log('SYSTEM READY — Manual mode active', 'info');
  }

  // ── State sync ─────────────────────────────────────────────────────────────

  _listenBus() {
    bus.on('state-change',      snap  => this._syncStatus(snap));
    bus.on('log',               entry => this._log(entry.text, entry.type));
    bus.on('limit-hit',         data  => this._log(`Limit hit: ${data.limit}`, 'warn'));
    bus.on('sequence-complete', data  => {
      this._log(`✓ Sequence complete → ${data.destination}`, 'info');
      this._showToast(`✓ ${data.destination} REACHED`, 'ok');
    });
    bus.on('object-clicked',    data  => this._showInspect(data.name));

    // Collision alarm — triggered before E-Stop fires
    bus.on('collision', data => {
      this._showToast(`⚠ COLLISION — Bag hit ${data.component} — E-STOP`, 'error');
      this._flashCollisionAlarm(data.component);
    });

    bus.on('interlock-trigger', data  => {
      this._flashEstop();
      const reasonToIL = {
        'mutual-exclusion':          '1',
        'shutter-open-no-travel':    '7',
        'shutter-home-zone-locked':  '7a',
        'shutter-open-no-auto':      '8',
        'shutter-blocked':           '9',
      };
      const ilNum = reasonToIL[data?.reason];
      if (ilNum) this._flashInterlockRow(ilNum.replace('a',''));
      const label = data?.reason?.replace(/-/g,' ').toUpperCase() ?? 'BLOCKED';
      this._showToast(`⊗ INTERLOCK IL-${ilNum ?? '?'} — ${label}`, 'error');
    });
  }

  _syncStatus(snap) {
    this._setText('status-mode',     snap.mode.toUpperCase());
    this._setText('status-height',   fmtMetres(snap.hookHeight));
    this._setText('status-position', fmtMetres(snap.hoistPos));

    // HUD bar quick-read
    this._setText('hud-pos', fmtMetres(snap.hoistPos));
    this._setText('hud-ht',  fmtMetres(snap.hookHeight));

    // Pulse auto buttons while sequence is running (InteractionSystem owns disabled state)
    const tankBtn = document.getElementById('btn-goto-tank');
    const homeBtn = document.getElementById('btn-goto-home');
    tankBtn?.classList.toggle('seq-btn--running', snap.state === 'seq-h2t');
    homeBtn?.classList.toggle('seq-btn--running', snap.state === 'seq-t2h');

    // Speed + zone badges
    const speedEl = document.getElementById('status-speed');
    if (speedEl) {
      speedEl.textContent = snap.speed.toUpperCase();
      speedEl.className   = 'status-value';
      speedEl.classList.add(snap.speed === 'fast' ? 'status-value--warn' : 'status-value--ok');
    }
    const zoneEl = document.getElementById('status-zone');
    if (zoneEl) {
      const zoneLabels = { low: 'LOW', fast: 'FAST', high: 'HIGH' };
      zoneEl.textContent = zoneLabels[snap.speedZone] ?? '—';
      zoneEl.className   = 'status-value';
      if (snap.speedZone === 'fast') zoneEl.classList.add('status-value--warn');
      else zoneEl.classList.add('status-value--ok');
    }

    // Sequence progress bar
    const progressWrap = document.getElementById('seq-progress-wrap');
    const progressBar  = document.getElementById('seq-progress-bar');
    const stepLabel    = document.getElementById('seq-step-label');
    const stepPct      = document.getElementById('seq-step-pct');
    if (progressWrap) {
      const show = snap.state.startsWith('seq-') && snap.seqTotal > 0;
      progressWrap.style.display = show ? '' : 'none';
      if (show && progressBar) {
        const pct = Math.round((snap.seqStep / snap.seqTotal) * 100);
        progressBar.style.width = `${pct}%`;
        if (stepLabel) stepLabel.textContent = `Step ${snap.seqStep + 1} of ${snap.seqTotal}`;
        if (stepPct)   stepPct.textContent   = `${pct}%`;
      }
    }

    // HUD status pill + LED dot
    const dot     = document.getElementById('hud-dot');
    const hudText = document.getElementById('hud-status-text');
    if (dot && hudText) {
      dot.className = 'hud__pill-dot';
      if (snap.eStop) {
        hudText.textContent = 'E-STOP';
        dot.classList.add('hud__pill-dot--error');
      } else if (snap.state === 'idle') {
        hudText.textContent = 'READY';
      } else if (snap.state.startsWith('seq-')) {
        hudText.textContent = 'AUTO RUN';
        dot.classList.add('hud__pill-dot--warn');
      } else {
        hudText.textContent = snap.state.toUpperCase();
        dot.classList.add('hud__pill-dot--warn');
      }
    }

    // State badge
    const stateEl = document.getElementById('status-state');
    if (stateEl) {
      stateEl.textContent = snap.eStop ? 'E-STOP' : snap.state.toUpperCase().replace('SEQ-', 'AUTO ');
      stateEl.className   = 'status-value';
      if (snap.eStop)                      stateEl.classList.add('status-value--error');
      else if (snap.state === 'idle')      stateEl.classList.add('status-value--ok');
      else                                 stateEl.classList.add('status-value--active');
    }

    // Location badge
    const limitEl = document.getElementById('status-limit');
    if (limitEl) {
      limitEl.textContent = snap.atTank ? 'TANK' : snap.atHome ? 'HOME' : '—';
      limitEl.className   = 'status-value';
      if (snap.atTank) limitEl.classList.add('status-value--ok');
      if (snap.atHome) limitEl.classList.add('status-value--warn');
    }

    // Shutter status
    const shutEl = document.getElementById('status-shutter');
    if (shutEl) {
      shutEl.textContent = snap.shutterOpen ? 'OPEN' : 'CLOSED';
      shutEl.className   = 'status-value' + (snap.shutterOpen ? ' status-value--error' : ' status-value--ok');
    }

    // Shutter button label
    const shutBtn = document.getElementById('btn-shutter');
    if (shutBtn) {
      shutBtn.textContent = snap.shutterOpen ? '⬜ CLOSE SHUTTER' : '⬛ OPEN SHUTTER';
      shutBtn.style.borderColor = snap.shutterOpen ? 'var(--red)' : '';
      shutBtn.style.color       = snap.shutterOpen ? 'var(--red)' : '';
    }

    // E-Stop / Reset
    const estopBtn = document.getElementById('btn-estop');
    const resetBtn = document.getElementById('btn-reset');
    if (estopBtn) estopBtn.classList.toggle('estop-btn--active', snap.eStop);
    if (resetBtn) {
      resetBtn.disabled = !snap.eStop;
      // Give the reset button a clearly lit "armed" appearance when E-Stop is active
      resetBtn.classList.toggle('reset-btn--armed', snap.eStop);
      // Show collision info in button label if that's why E-Stop fired
      if (snap.eStop && snap.collision) {
        resetBtn.textContent = `↺ RESET (${snap.collision.component} HIT)`;
      } else if (snap.eStop) {
        resetBtn.textContent = '↺ RESET';
      } else {
        resetBtn.textContent = '↺ RESET';
      }
    }
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  _bindSidebar() {
    const sidebar    = document.getElementById('sidebar');
    const tab        = document.getElementById('sidebar-tab');
    const toggleBtn  = document.getElementById('btn-sidebar-toggle');

    toggleBtn?.addEventListener('click', () => this._collapseSidebar(sidebar, tab, toggleBtn));
    tab?.addEventListener('click',       () => this._expandSidebar(sidebar, tab, toggleBtn));
  }

  _collapseSidebar(sidebar, tab, btn) {
    sidebar.style.display = 'none';
    tab.style.display     = 'flex';
    this._afterSidebarChange();
  }

  _expandSidebar(sidebar, tab, btn) {
    sidebar.style.display = '';
    tab.style.display     = 'none';
    this._afterSidebarChange();
  }

  _afterSidebarChange() {
    // Let the browser repaint, then resize renderer & camera
    requestAnimationFrame(() => {
      this._renderer.resize();
      this._camera.resize();
    });
  }

  // ── Accordion ─────────────────────────────────────────────────────────────

  _bindAccordion() {
    document.querySelectorAll('.accordion__header').forEach(header => {
      header.addEventListener('click', () => {
        const body  = header.nextElementSibling;
        const arrow = header.querySelector('.accordion__arrow');
        const open  = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        if (arrow) arrow.textContent = open ? '▸' : '▾';
        header.classList.toggle('active', !open);
      });
    });
  }

  // ── Settings panel ─────────────────────────────────────────────────────────

  _bindSettings() {
    // Shutter toggle
    document.getElementById('btn-shutter')?.addEventListener('click', () => {
      bus.emit('shutter-toggle');
    });

    // Time-scale slider
    const tsSlider = document.getElementById('slider-timescale');
    const tsLabel  = document.getElementById('label-timescale');
    tsSlider?.addEventListener('input', () => {
      const v = parseInt(tsSlider.value, 10);
      if (tsLabel) tsLabel.textContent = `${v}×`;
      bus.emit('set-time-scale', v);
    });

    // Panel side toggle
    document.getElementById('btn-panel-side')?.addEventListener('click', () => {
      this._sidebarSide = this._sidebarSide === 'right' ? 'left' : 'right';
      const sidebar = document.getElementById('sidebar');
      const tab     = document.getElementById('sidebar-tab');
      const hud     = document.getElementById('hud-bar');
      const cli     = document.getElementById('cli-log');
      sidebar?.classList.toggle('sidebar--right', this._sidebarSide === 'right');
      sidebar?.classList.toggle('sidebar--left',  this._sidebarSide === 'left');
      tab?.classList.toggle('sidebar-tab--right', this._sidebarSide === 'right');
      tab?.classList.toggle('sidebar-tab--left',  this._sidebarSide === 'left');
      document.body.classList.toggle('sidebar-right', this._sidebarSide === 'right');
      document.body.classList.toggle('sidebar-left',  this._sidebarSide === 'left');
      document.getElementById('btn-panel-side').textContent = this._sidebarSide === 'right' ? 'RIGHT ↔' : 'LEFT ↔';
    });

    // Theme
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      this._theme = this._theme === 'dark' ? 'light' : 'dark';
      document.body.classList.toggle('theme-light', this._theme === 'light');
      document.getElementById('btn-theme').textContent = this._theme === 'dark' ? 'DARK 🌙' : 'LIGHT ☀️';
    });

    // Font size slider
    document.getElementById('slider-font')?.addEventListener('input', e => {
      this._fontSize = +e.target.value;
      document.documentElement.style.setProperty('--font-scale', FONT_SCALES[this._fontSize]);
    });

    // CLI toggle
    document.getElementById('btn-cli-toggle')?.addEventListener('click', () => {
      this._cliEnabled = !this._cliEnabled;
      const cli = document.getElementById('cli-log');
      if (cli) cli.style.display = this._cliEnabled ? '' : 'none';
      document.getElementById('btn-cli-toggle').textContent = this._cliEnabled ? 'ON ▮' : 'OFF ▯';
    });

    // Resolution selector
    document.getElementById('select-resolution')?.addEventListener('change', e => {
      const val = e.target.value;
      if (val === 'native') {
        this._renderer.setResolution(null);
      } else {
        const [w, h] = val.split('x').map(Number);
        this._renderer.setResolution({ w, h });
      }
    });

    // Background swatches
    document.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('swatch--active'));
        sw.classList.add('swatch--active');
        this._scene.setBackground(sw.dataset.color);
      });
    });
  }

  // ── Inspect Panel ──────────────────────────────────────────────────────────

  _bindInspectPanel() {
    document.getElementById('btn-inspect-close')?.addEventListener('click', () => {
      document.getElementById('inspect-panel').style.display = 'none';
    });
  }

  /**
   * Show inspect panel for the clicked component.
   * Assets registry — populated here; replace placeholder hrefs with real paths.
   */
  _showInspect(name) {
    const panel = document.getElementById('inspect-panel');
    const title = document.getElementById('inspect-title');
    const body  = document.getElementById('inspect-body');
    if (!panel || !name) { panel.style.display = 'none'; return; }

    const COMPONENTS = {
      hoist: {
        label: 'CHAIN HOIST (1.5t)',
        assets: [
          // { type: 'PDF', label: 'Hoist Manual',          href: '/assets/docs/hoist-manual.pdf' },
          // { type: 'IMG', label: 'Wiring Diagram',        href: '/assets/docs/hoist-wiring.png' },
          // { type: 'VID', label: 'Maintenance Video',     href: '/assets/docs/hoist-maintenance.mp4' },
        ],
      },
      ibeam: {
        label: 'MONORAIL I-BEAM',
        assets: [
          // { type: 'PDF', label: 'Beam Specification',    href: '/assets/docs/ibeam-spec.pdf' },
        ],
      },
      bigbag: {
        label: 'BIG BAG (1t)',
        assets: [
          // { type: 'PDF', label: 'Big Bag Data Sheet',   href: '/assets/docs/bigbag-spec.pdf' },
        ],
      },
      tank: {
        label: 'TIPPING HOPPER / TANK',
        assets: [
          // { type: 'PDF', label: 'Hopper Drawing',       href: '/assets/docs/hopper-drawing.pdf' },
          // { type: 'VID', label: 'Tipping Demonstration', href: '/assets/docs/tipping-demo.mp4' },
        ],
      },
    };

    const comp = COMPONENTS[name];
    if (!comp) return;

    title.textContent = comp.label;

    const ICONS = { PDF: '📄', IMG: '🖼', VID: '🎬', default: '📎' };

    body.innerHTML = comp.assets.length > 0
      ? comp.assets.map(a => `
          <a class="asset-link" href="${a.href}" target="_blank" rel="noopener">
            <span class="asset-link__icon">${ICONS[a.type] ?? ICONS.default}</span>
            <span class="asset-link__name">${a.label}</span>
            <span class="asset-link__type">${a.type}</span>
          </a>`).join('')
      : `<div class="inspect-panel__placeholder">
           📂 No documents attached yet.<br>
           <small>Add asset paths in UIController.js → COMPONENTS['${name}']</small>
         </div>`;

    panel.style.display = '';
  }

  // ── CLI Log ────────────────────────────────────────────────────────────────

  _log(text, type = 'info') {
    if (!this._cliEnabled) return;
    const inner = document.getElementById('cli-log__inner');
    if (!inner) return;

    const line = document.createElement('div');
    line.className = `cli-line cli-line--${type}`;
    line.textContent = `> ${text}`;
    inner.prepend(line);

    this._logQueue.push(line);
    if (this._logQueue.length > this._MAX_LOG) {
      this._logQueue.shift().remove();
    }
  }

  _flashEstop() {
    document.getElementById('btn-estop')?.classList.add('estop-btn--active');
  }

  _flashInterlockRow(ilNum) {
    const row = document.querySelector(`.interlock-row[data-il="${ilNum}"]`);
    if (!row) return;
    row.classList.remove('interlock-row--triggered');
    // Force reflow to restart animation
    void row.offsetWidth;
    row.classList.add('interlock-row--triggered');
    setTimeout(() => row.classList.remove('interlock-row--triggered'), 1400);
  }

  _flashCollisionAlarm(component) {
    let alarm = document.getElementById('collision-alarm');
    if (!alarm) {
      alarm = document.createElement('div');
      alarm.id = 'collision-alarm';
      alarm.style.cssText = [
        'position:fixed;inset:0;pointer-events:none;z-index:500;',
        'display:flex;align-items:center;justify-content:center;',
      ].join('');
      const label = document.createElement('div');
      label.id = 'collision-alarm-label';
      label.style.cssText = [
        'font-family:var(--font-ui);font-weight:900;font-size:26px;',
        'letter-spacing:4px;text-transform:uppercase;color:#fff;',
        'text-shadow:0 0 24px #ff3322,0 2px 0 #000;',
        'opacity:0;transition:opacity 0.1s;padding:14px 28px;',
        'border:3px solid rgba(255,80,60,0.85);background:rgba(0,0,0,0.75);',
        'border-radius:4px;',
      ].join('');
      alarm.appendChild(label);
      document.body.appendChild(alarm);
      if (!document.getElementById('col-alarm-kf')) {
        const s = document.createElement('style');
        s.id = 'col-alarm-kf';
        s.textContent = '@keyframes col-alarm-flash{' +
          '0%,100%{background:rgba(232,54,42,0.0)}' +
          '15%,45%,75%{background:rgba(232,54,42,0.28)}' +
          '30%,60%{background:rgba(232,54,42,0.08)}}';
        document.head.appendChild(s);
      }
    }
    const label = document.getElementById('collision-alarm-label');
    if (label) label.textContent = '\u26a0 COLLISION \u2014 ' + component;
    alarm.style.animation = 'none';
    void alarm.offsetWidth;
    alarm.style.animation = 'col-alarm-flash 0.55s ease 4';
    if (label) label.style.opacity = '1';
    setTimeout(() => { if (label) label.style.opacity = '0'; }, 3000);
  }

  /**
   * Show a brief non-blocking toast notification at the bottom of the viewport.
   * @param {string} text
   * @param {'ok'|'error'|'warn'} type
   */
  _showToast(text, type = 'info') {
    let toast = document.getElementById('sim-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sim-toast';
      toast.style.cssText = `
        position:fixed;
        bottom:80px;
        left:50%;
        transform:translateX(-50%);
        padding:6px 18px;
        border-radius:3px;
        font-family:var(--font-ui);
        font-weight:700;
        font-size:11px;
        letter-spacing:1.5px;
        text-transform:uppercase;
        pointer-events:none;
        z-index:301;
        opacity:0;
        transition:opacity 0.15s ease;
        white-space:nowrap;
      `;
      document.body.appendChild(toast);
    }

    const styles = {
      ok:    { bg: 'rgba(20,50,25,0.96)', border: 'var(--green)',  color: 'var(--green)' },
      error: { bg: 'rgba(50,10,10,0.96)', border: 'var(--red)',    color: 'var(--red)'   },
      warn:  { bg: 'rgba(40,30,5,0.96)',  border: 'var(--amber)',  color: 'var(--amber)' },
      info:  { bg: 'rgba(10,25,40,0.96)', border: 'var(--blue)',   color: 'var(--blue)'  },
    };
    const s = styles[type] ?? styles.info;
    toast.style.background  = s.bg;
    toast.style.border      = `1px solid ${s.border}`;
    toast.style.color       = s.color;
    toast.textContent       = text;
    toast.style.opacity     = '1';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}
