/**
 * LightingSystem.js
 * Sets up ambient + directional lights for the scene.
 * Industrial warehouse feel — strong overhead, soft fill.
 */

import * as THREE from 'three';

export class LightingSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this._lights = [];
    this._setup();
  }

  _setup() {
    // Ambient — base illumination
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
    this._lights.push(ambient);

    // Main overhead directional (sun / warehouse ceiling lights)
    const main = new THREE.DirectionalLight(0xffffff, 1.8);
    main.position.set(5, 20, 10);
    main.castShadow = true;
    main.shadow.mapSize.set(2048, 2048);
    main.shadow.camera.near   = 0.5;
    main.shadow.camera.far    = 60;
    main.shadow.camera.left   = -12;
    main.shadow.camera.right  =  12;
    main.shadow.camera.top    =  12;
    main.shadow.camera.bottom = -12;
    this.scene.add(main);
    this._lights.push(main);

    // Cool fill from the left — simulates wall/window bounce
    const fill = new THREE.DirectionalLight(0x9ab8d8, 0.6);
    fill.position.set(-8, 8, 5);
    this.scene.add(fill);
    this._lights.push(fill);

    // Warm back-rim from behind — gives depth to machinery
    const rim = new THREE.DirectionalLight(0xffd090, 0.5);
    rim.position.set(4, 5, -10);
    this.scene.add(rim);
    this._lights.push(rim);
  }

  /** Adjust overall brightness (e.g. for light/dark theme) */
  setIntensity(multiplier) {
    this._lights.forEach(l => {
      if (l._baseIntensity === undefined) l._baseIntensity = l.intensity;
      l.intensity = l._baseIntensity * multiplier;
    });
  }
}
