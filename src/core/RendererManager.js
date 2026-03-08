/**
 * RendererManager.js
 * Initialises and owns the Three.js WebGLRenderer.
 * Handles resize, pixel-ratio, and resolution overrides.
 */

import * as THREE from 'three';

export class RendererManager {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace   = THREE.SRGBColorSpace;

    this._resolutionOverride = null; // { w, h } or null (native)
    this._resizeObserver = null;

    this._bindResize();
    this.resize();
  }

  /** Fit renderer to current canvas display size (or override) */
  resize() {
    if (this._resolutionOverride) {
      const { w, h } = this._resolutionOverride;
      this.renderer.setSize(w, h, false);
      return;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
  }

  /**
   * Set a fixed resolution override (e.g. 1920×1080).
   * Pass null to restore native sizing.
   * @param {{ w:number, h:number }|null} resolution
   */
  setResolution(resolution) {
    this._resolutionOverride = resolution;
    this.resize();
  }

  _bindResize() {
    // Use ResizeObserver on the canvas parent so we catch sidebar-driven layout changes
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas.parentElement ?? document.body);
  }

  /** Called every frame by AnimationLoop */
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  get domElement() { return this.renderer.domElement; }

  dispose() {
    this._resizeObserver?.disconnect();
    this.renderer.dispose();
  }
}
