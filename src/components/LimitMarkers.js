/**
 * LimitMarkers.js
 * Visual indicators for all system limits:
 *   - H1–H4  : horizontal dashed planes with labels
 *   - L1–L4  : vertical trigger rods on beam soffit
 *   - Stopper A & B : red blocks at beam ends
 *   - Home / Tank zone indicators
 */

import * as THREE from 'three';
import {
  H1, H2, H3, H4,
  L1, L2, L3, L4,
  STOPPER_A, STOPPER_B,
  BEAM_HEIGHT, BEAM_LENGTH, HOME_X, TANK_X,
  COLOR,
} from '../utils/constants.js';
import { BEAM_TOTAL_H } from './IBeamMesh.js';

export class LimitMarkers {
  constructor(scene) {
    this._scene = scene;
    this._build();
  }

  _build() {
    this._buildHLimits();
    this._buildLTriggers();
    this._buildStoppers();
    this._buildZoneIndicators();
  }

  // ── H-limit planes ────────────────────────────────────────────────────
  _buildHLimits() {
    const hDefs = [
      { h: H1, color: COLOR.STOPPER,  label: 'H1', opacity: 0.20 },
      { h: H2, color: 0xff8c42,       label: 'H2', opacity: 0.15 },
      { h: H3, color: COLOR.TRIGGER,  label: 'H3', opacity: 0.15 },
      { h: H4, color: COLOR.SHUTTER,  label: 'H4', opacity: 0.15 },
    ];

    hDefs.forEach(({ h, color, opacity }) => {
      // Dashed semi-transparent plane at limit height
      const geo = new THREE.PlaneGeometry(1.4, 0.9);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.position.set(HOME_X, h, 0);
      this._scene.add(plane);

      // Solid tick line across beam width
      const linePts = [
        new THREE.Vector3(STOPPER_A, h, 0),
        new THREE.Vector3(STOPPER_B, h, 0),
      ];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }),
      );
      this._scene.add(line);
    });
  }

  // ── L-trigger rods on beam soffit ─────────────────────────────────────
  _buildLTriggers() {
    const lDefs = [
      { pos: L1, label: 'L1' },
      { pos: L2, label: 'L2' },
      { pos: L3, label: 'L3' },
      { pos: L4, label: 'L4' },
    ];

    const triggerMat = new THREE.MeshStandardMaterial({
      color: COLOR.TRIGGER, metalness: 0.7, roughness: 0.3,
    });

    const beamSoffit = BEAM_HEIGHT - BEAM_TOTAL_H / 2;

    lDefs.forEach(({ pos }) => {
      // Main rod hanging from beam soffit
      const rodGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.22, 8);
      const rod    = new THREE.Mesh(rodGeo, triggerMat);
      rod.position.set(pos, beamSoffit - 0.11, 0.18);
      rod.castShadow = true;
      this._scene.add(rod);

      // Cap on rod
      const capGeo = new THREE.CylinderGeometry(0.025, 0.016, 0.04, 8);
      const cap    = new THREE.Mesh(capGeo, triggerMat);
      cap.position.set(pos, beamSoffit - 0.235, 0.18);
      this._scene.add(cap);

      // Mounting bracket (connects rod to beam)
      const brktGeo = new THREE.BoxGeometry(0.04, 0.04, 0.18);
      const brkt    = new THREE.Mesh(brktGeo, new THREE.MeshStandardMaterial({
        color: 0x263040, metalness: 0.8,
      }));
      brkt.position.set(pos, beamSoffit - 0.02, 0.09);
      this._scene.add(brkt);

      // Vertical dashed line from beam to ground (subtle)
      const dashPts = [
        new THREE.Vector3(pos, 0, 0),
        new THREE.Vector3(pos, beamSoffit, 0),
      ];
      this._scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(dashPts),
        new THREE.LineBasicMaterial({
          color: COLOR.TRIGGER, transparent: true, opacity: 0.08,
        }),
      ));
    });
  }

  // ── Mechanical stoppers ─────────────────────────────────────────────────
  _buildStoppers() {
    const stopMat = new THREE.MeshStandardMaterial({
      color:     COLOR.STOPPER,
      metalness: 0.6,
      roughness: 0.4,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color:     COLOR.STOPPER,
      emissive:  COLOR.STOPPER,
      emissiveIntensity: 0.25,
      transparent: true, opacity: 0.7,
    });

    [
      { x: STOPPER_A, label: 'A' },
      { x: STOPPER_B, label: 'B' },
    ].forEach(({ x }) => {
      // Main stopper block
      const stopGeo = new THREE.BoxGeometry(0.10, 0.22, 0.28);
      const stop    = new THREE.Mesh(stopGeo, stopMat);
      stop.position.set(x, BEAM_HEIGHT, 0);
      stop.castShadow = true;
      this._scene.add(stop);

      // Rubber bumper pad (slightly protruding)
      const bumperSide = x < 5 ? 1 : -1;   // face inward
      const bGeo = new THREE.BoxGeometry(0.04, 0.16, 0.22);
      const b    = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({
        color: 0x3a0a0a, roughness: 0.95,
      }));
      b.position.set(x + bumperSide * 0.07, BEAM_HEIGHT, 0);
      this._scene.add(b);

      // Glow halo (semi-transparent box slightly larger)
      const haloGeo = new THREE.BoxGeometry(0.16, 0.28, 0.34);
      const halo    = new THREE.Mesh(haloGeo, glowMat);
      halo.position.set(x, BEAM_HEIGHT, 0);
      this._scene.add(halo);

      // Diagonal warning stripes (flat box at angle)
      const stripeGeo = new THREE.BoxGeometry(0.005, 0.14, 0.22);
      [-0.06, 0, 0.06].forEach(dx => {
        const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({
          color: 0x1a0000, roughness: 0.9,
        }));
        stripe.position.set(x + dx, BEAM_HEIGHT, 0);
        this._scene.add(stripe);
      });
    });
  }

  // ── Home / Tank zone floor indicators ──────────────────────────────────
  _buildZoneIndicators() {
    // Home zone — green floor circle
    const homeCircle = new THREE.Mesh(
      new THREE.CircleGeometry(0.60, 32),
      new THREE.MeshBasicMaterial({
        color: COLOR.SHUTTER, transparent: true, opacity: 0.06, side: THREE.DoubleSide,
      }),
    );
    homeCircle.rotation.x = -Math.PI / 2;
    homeCircle.position.set(HOME_X, 0.002, 0);
    this._scene.add(homeCircle);

    // Home zone border
    const homeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.64, 32),
      new THREE.MeshBasicMaterial({
        color: COLOR.SHUTTER, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
      }),
    );
    homeRing.rotation.x = -Math.PI / 2;
    homeRing.position.set(HOME_X, 0.003, 0);
    this._scene.add(homeRing);

    // Tank zone — green floor rectangle
    const tankZone = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.2),
      new THREE.MeshBasicMaterial({
        color: COLOR.TANK_E, transparent: true, opacity: 0.06, side: THREE.DoubleSide,
      }),
    );
    tankZone.rotation.x = -Math.PI / 2;
    tankZone.position.set(TANK_X, 0.002, 0);
    this._scene.add(tankZone);
  }
}
