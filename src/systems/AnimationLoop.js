/**
 * AnimationLoop.js
 * Drives the requestAnimationFrame game loop.
 * Distributes delta time to all registered update callbacks.
 */

export class AnimationLoop {
  constructor(rendererManager, sceneManager, cameraManager) {
    this._renderer = rendererManager;
    this._scene    = sceneManager;
    this._camera   = cameraManager;

    this._callbacks  = []; // { id, fn }
    this._rafId      = null;
    this._lastTime   = null;
    this._running    = false;
  }

  /**
   * Register a per-frame update callback.
   * @param {function(deltaSeconds: number): void} fn
   * @returns {number} id (use to unregister)
   */
  register(fn) {
    const id = Date.now() + Math.random();
    this._callbacks.push({ id, fn });
    return id;
  }

  unregister(id) {
    this._callbacks = this._callbacks.filter(c => c.id !== id);
  }

  start() {
    if (this._running) return;
    this._running  = true;
    this._lastTime = performance.now();
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _tick() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(ts => {
      const delta = Math.min((ts - this._lastTime) / 1000, 0.1); // cap at 100ms
      this._lastTime = ts;

      // Run all registered updaters
      this._callbacks.forEach(({ fn }) => {
        try { fn(delta); } catch (e) { console.error('[AnimationLoop] updater error', e); }
      });

      // Render
      this._renderer.render(this._scene.scene, this._camera.camera);

      this._tick();
    });
  }
}
