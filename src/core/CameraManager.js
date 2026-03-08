/**
 * CameraManager.js
 * Orthographic camera — fixed isometric view, pan & constrained zoom only.
 *
 * Rules (Section 3):
 *   - No rotation allowed — quaternion is locked after initialisation
 *   - Zoom OUT limit: scene fills no less than 50% of screen
 *   - Zoom IN  limit: scene fills no more than 1000% of screen
 *   - Pan: left-drag or middle-drag
 */

import * as THREE from 'three';
import {
  BEAM_LENGTH, BEAM_HEIGHT,
  ZOOM_MIN, ZOOM_MAX,
} from '../utils/constants.js';

// Scene "centre of interest" in world space
const SCENE_CX = BEAM_LENGTH * 0.5;
const SCENE_CY = BEAM_HEIGHT * 0.45;

// Base frustum half-height in metres (zoom = 1.0)
const HALF_H = 9.0;

// Isometric orientation — 30° horizontal, ~26° vertical tilt
const AZIMUTH   =  Math.PI / 6;   // 30°
const ELEVATION =  Math.PI / 7;   // ≈25.7°
const CAM_DIST  = 100;

export class CameraManager {
  constructor(canvas) {
    this.canvas = canvas;

    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.camera = new THREE.OrthographicCamera(
      -HALF_H * aspect,  HALF_H * aspect,
       HALF_H,          -HALF_H,
      -300, 500,
    );

    this._zoom   = 1.0;
    this._target = new THREE.Vector3(SCENE_CX, SCENE_CY, 0);

    // Position camera at isometric angle, lock quaternion
    this._applyIso();
    this._isoQ = this.camera.quaternion.clone();

    // Pan state
    this._drag      = false;
    this._lastX     = 0;
    this._lastY     = 0;
    this._didPan    = false;   // distinguishes click from drag

    this._bindEvents();
  }

  // ── Isometric orientation ─────────────────────────────────────────────────

  _applyIso() {
    const dx = CAM_DIST * Math.cos(ELEVATION) * Math.sin(AZIMUTH);
    const dy = CAM_DIST * Math.sin(ELEVATION);
    const dz = CAM_DIST * Math.cos(ELEVATION) * Math.cos(AZIMUTH);
    this.camera.position.set(
      this._target.x + dx,
      this._target.y + dy,
      this._target.z + dz,
    );
    this.camera.lookAt(this._target);
  }

  _applyFrustum() {
    const aspect = this.canvas.clientWidth / (this.canvas.clientHeight || 1);
    const h = HALF_H / this._zoom;
    this.camera.left   = -h * aspect;
    this.camera.right  =  h * aspect;
    this.camera.top    =  h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
    // Re-enforce locked quaternion — prevents any accidental rotation
    this.camera.quaternion.copy(this._isoQ);
  }

  _applyTarget() {
    const dx = CAM_DIST * Math.cos(ELEVATION) * Math.sin(AZIMUTH);
    const dy = CAM_DIST * Math.sin(ELEVATION);
    const dz = CAM_DIST * Math.cos(ELEVATION) * Math.cos(AZIMUTH);
    this.camera.position.set(
      this._target.x + dx,
      this._target.y + dy,
      this._target.z + dz,
    );
    this.camera.quaternion.copy(this._isoQ);
    this._applyFrustum();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  resize() { this._applyFrustum(); }

  zoomBy(delta) {
    this._zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._zoom * (1 + delta)));
    this._applyFrustum();
  }

  /** Returns true if the last pointerdown–pointerup was a pan (not a click) */
  get consumedAsClick() { return !this._didPan; }

  // ── Pan ───────────────────────────────────────────────────────────────────

  _panByScreen(dx, dy) {
    const aspect = this.canvas.clientWidth / (this.canvas.clientHeight || 1);
    const worldH = (2 * HALF_H) / this._zoom;
    const worldW = worldH * aspect;

    // Right and up vectors relative to the locked iso quaternion
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this._isoQ);
    const up    = new THREE.Vector3(0, 1, 0).applyQuaternion(this._isoQ);

    const panR =  (dx / this.canvas.clientWidth)  * worldW;
    const panU = -(dy / this.canvas.clientHeight) * worldH;

    this._target.addScaledVector(right, -panR);
    this._target.addScaledVector(up,    -panU);
    this._applyTarget();
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown', e => {
      if (e.button === 0 || e.button === 1) {
        this._drag   = true;
        this._didPan = false;
        this._lastX  = e.clientX;
        this._lastY  = e.clientY;
      }
    });

    c.addEventListener('mousemove', e => {
      if (!this._drag) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._didPan = true;
      this._panByScreen(dx, dy);
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });

    c.addEventListener('mouseup',    () => { this._drag = false; });
    c.addEventListener('mouseleave', () => { this._drag = false; });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomBy(-e.deltaY * 0.0012);
    }, { passive: false });

    // Touch pan
    let t0 = null;
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this._drag   = true;
        this._didPan = false;
        t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._lastX = t0.x; this._lastY = t0.y;
      }
    });
    c.addEventListener('touchmove', e => {
      if (!this._drag || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this._lastX;
      const dy = e.touches[0].clientY - this._lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._didPan = true;
      this._panByScreen(dx, dy);
      this._lastX = e.touches[0].clientX;
      this._lastY = e.touches[0].clientY;
    });
    c.addEventListener('touchend', () => { this._drag = false; });
  }
}
