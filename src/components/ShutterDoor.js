/**
 * ShutterDoor.js
 * Guillotine shutter door at the right-end structural wall (X = 9.5m).
 * This marks the loading bay entry — the hoist parks at HOME_X (8m) inside,
 * the door seals the opening at the building envelope.
 * Slides vertically upward when open.
 */

import * as THREE from 'three';
import { COLOR } from '../utils/constants.js';
import { bus } from '../utils/mathHelpers.js';

// Absolute world position — at right structural wall, beyond beam end
export const SHUTTER_X = 9.5;

const DOOR_W = 1.20;   // opening width
const DOOR_H = 1.80;   // full closed panel height
const DOOR_T = 0.05;   // panel thickness
const TRAVEL = DOOR_H + 0.10;  // upward travel to fully open

export class ShutterDoor {
  constructor(scene) {
    this._group = new THREE.Group();
    this._clickMeshes = [];
    this._open = false;
    this._t = 0;   // 0=closed, 1=open
    this._build();
    scene.add(this._group);

    bus.on('state-change', snap => { this._open = snap.shutterOpen; });
  }

  _build() {
    const x = SHUTTER_X;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2a3535, roughness: 0.6, metalness: 0.6,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x1c3a30, roughness: 0.55, metalness: 0.5,
    });
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x264030, metalness: 0.65,
    });

    // ── Frame ─────────────────────────────────────────────────────────────
    const postH = DOOR_H + 0.45;

    // Left & right guide posts (also act as rails)
    for (const dz of [-DOOR_W / 2 - 0.04, DOOR_W / 2 + 0.04]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, postH, 0.07), frameMat);
      post.position.set(x, postH / 2, dz);
      post.castShadow = true;
      this._group.add(post);
    }

    // Header beam
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, DOOR_W + 0.18), frameMat);
    header.position.set(x, postH - 0.04, 0);
    header.castShadow = true;
    this._group.add(header);

    // Actuator cylinder (drive mechanism on top)
    const actuator = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 }),
    );
    actuator.position.set(x + 0.06, postH - 0.28, 0);
    this._group.add(actuator);

    // ── Door panel (moves with position.y) ────────────────────────────────
    this._doorGroup = new THREE.Group();
    this._doorGroup.position.set(x, 0, 0);
    this._group.add(this._doorGroup);

    const panelGeo = new THREE.BoxGeometry(DOOR_T, DOOR_H, DOOR_W);
    this._doorPanel = new THREE.Mesh(panelGeo, doorMat);
    this._doorPanel.position.y = DOOR_H / 2;
    this._doorPanel.castShadow = true;
    this._doorGroup.add(this._doorPanel);

    // Horizontal stiffener ribs
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_T + 0.012, 0.028, DOOR_W),
        ribMat,
      );
      rib.position.y = 0.18 + i * (DOOR_H / 5);
      this._doorPanel.add(rib);
    }

    // Handle bar
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, DOOR_W * 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.85 }),
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(DOOR_T * 0.8, 0, 0);
    this._doorPanel.add(handle);

    // ── Status LED on header ───────────────────────────────────────────────
    this._led = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      new THREE.MeshStandardMaterial({
        color: COLOR.SHUTTER,
        emissive: COLOR.SHUTTER,
        emissiveIntensity: 0.9,
      }),
    );
    this._led.position.set(x + 0.07, postH + 0.04, 0.12);
    this._group.add(this._led);

    // ── Floor threshold ────────────────────────────────────────────────────
    const thresh = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.025, DOOR_W),
      frameMat,
    );
    thresh.position.set(x, 0.013, 0);
    this._group.add(thresh);

    // ── Floor warning stripes (yellow/black hatching) ─────────────────────
    const stripeN = 6;
    for (let i = 0; i < stripeN; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, DOOR_W / stripeN),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0xf0a500 : 0x111111,
          roughness: 0.95, transparent: true, opacity: 0.65,
        }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.rotation.z = Math.PI / 4;
      stripe.position.set(x - 0.28, 0.002, -DOOR_W / 2 + (i + 0.5) * (DOOR_W / stripeN));
      this._group.add(stripe);
    }
  }

  update(delta) {
    const target = this._open ? 1.0 : 0.0;
    const speed = 0.8;
    const dir = target > this._t ? 1 : -1;
    this._t = Math.max(0, Math.min(1, this._t + dir * speed * delta));

    this._doorPanel.position.y = DOOR_H / 2 + this._t * TRAVEL;

    const col = this._open ? 0xff5252 : COLOR.SHUTTER;
    this._led.material.color.setHex(col);
    this._led.material.emissive.setHex(col);
  }

  get clickableMeshes() { return this._clickMeshes; }
  setHighlight() { }
}
