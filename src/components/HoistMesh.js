/**
 * HoistMesh.js
 * Chain hoist with trolley, motor housing, chain, J-hook,
 * and a Telemecanique XLS cross-arm rotary limit switch.
 *
 * The limit switch arm rotates CW when chain hits H1 (upper),
 * and CCW when chain hits H4 (lower), returning to neutral otherwise.
 */

import * as THREE from 'three';
import {
  BEAM_HEIGHT, INITIAL_HOIST_POS, INITIAL_HOOK_HEIGHT,
  H1, H4, COLOR,
} from '../utils/constants.js';
import { BEAM_TOTAL_H } from './IBeamMesh.js';
import { bus } from '../utils/mathHelpers.js';

const TROLLEY_H = 0.14;
const MOTOR_W   = 0.38;
const MOTOR_H   = 0.30;
const MOTOR_D   = 0.28;
const CHAIN_R   = 0.018;
const CHAIN_BASE= 1.0;

// Limit switch arm target angles (radians)
const ARM_NEUTRAL = 0;
const ARM_CW      =  Math.PI * 0.35;   // triggered H1 (upper)
const ARM_CCW     = -Math.PI * 0.35;   // triggered H4 (lower)
const ARM_SPEED   = 3.0;              // rad/s rotation speed

export class HoistMesh {
  constructor(scene) {
    this._group       = new THREE.Group();
    this._clickMeshes = [];
    this._armAngle    = ARM_NEUTRAL;
    this._armTarget   = ARM_NEUTRAL;

    this._build();
    this._group.position.set(INITIAL_HOIST_POS, 0, 0);
    scene.add(this._group);

    // Listen for limit hits to animate switch arm
    bus.on('limit-hit', ({ limit }) => {
      if (limit === 'H1') this._armTarget = ARM_CW;
      if (limit === 'H4') this._armTarget = ARM_CCW;
    });
    // Return to neutral when state goes back to idle/moving
    bus.on('state-change', snap => {
      if (snap.state !== 'lifting' && snap.state !== 'lowering' &&
          !snap.state.startsWith('seq-')) {
        // Decay to neutral over time (handled in update)
      }
      if (snap.state === 'idle' || snap.state === 'travelling') {
        this._armTarget = ARM_NEUTRAL;
      }
    });
  }

  _build() {
    const beamBottomY = BEAM_HEIGHT - BEAM_TOTAL_H / 2;

    // ── Trolley side plates ───────────────────────────────────────────────
    const trolleyMat = new THREE.MeshStandardMaterial({
      color: COLOR.HOIST, roughness: 0.4, metalness: 0.8,
    });
    for (const dz of [-0.14, 0.14]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, TROLLEY_H, 0.04), trolleyMat);
      plate.position.set(0, beamBottomY - TROLLEY_H / 2 + 0.04, dz);
      plate.castShadow = true;
      this._group.add(plate);
    }

    // Cross-beam
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.28), trolleyMat);
    cross.position.set(0, beamBottomY - TROLLEY_H + 0.02, 0);
    cross.castShadow = true;
    this._group.add(cross);

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x5a6d7c, metalness: 0.85, roughness: 0.3 });
    for (const dx of [-0.08, 0.08]) {
      for (const dz of [-0.14, 0.14]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 12), wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(dx, beamBottomY - 0.025, dz);
        this._group.add(wheel);
      }
    }

    // ── Motor housing ─────────────────────────────────────────────────────
    const motorY   = beamBottomY - TROLLEY_H - MOTOR_H / 2 - 0.04;
    const motorMat = new THREE.MeshStandardMaterial({ color: COLOR.HOIST, roughness: 0.4, metalness: 0.8 });
    const motorGeo = new THREE.BoxGeometry(MOTOR_W, MOTOR_H, MOTOR_D);
    this._motorMesh = new THREE.Mesh(motorGeo, motorMat);
    this._motorMesh.position.set(0, motorY, 0);
    this._motorMesh.castShadow = true;
    this._group.add(this._motorMesh);
    this._clickMeshes.push(this._motorMesh);

    this._motorMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(motorGeo, 10),
      new THREE.LineBasicMaterial({ color: COLOR.HOIST_EDGE }),
    ));

    // Ventilation ribs
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x0d1520, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(MOTOR_W + 0.005, 0.012, 0.006), ribMat);
      rib.position.set(0, motorY - MOTOR_H / 2 + 0.04 + i * 0.048, MOTOR_D / 2 + 0.003);
      this._group.add(rib);
    }

    // Gearbox housing
    const gearMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.18, 0.20),
      new THREE.MeshStandardMaterial({ color: 0x1e2d20, roughness: 0.6, metalness: 0.5 }),
    );
    gearMesh.position.set(MOTOR_W / 2 + 0.05, motorY + 0.03, 0);
    gearMesh.castShadow = true;
    this._group.add(gearMesh);

    // ── Telemecanique XLS Cross-Arm Rotary Limit Switch ───────────────────
    // Mounted on the left side of the motor, near the chain sprocket
    this._buildLimitSwitch(motorY);

    // ── Chain attachment lug ──────────────────────────────────────────────
    const chainTopY = motorY - MOTOR_H / 2 - 0.03;
    const lug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.04, 0.06, 10),
      new THREE.MeshStandardMaterial({ color: COLOR.CHAIN, metalness: 0.9, roughness: 0.2 }),
    );
    lug.position.set(0, chainTopY, 0);
    this._group.add(lug);

    // ── Chain ─────────────────────────────────────────────────────────────
    const chainGeo = new THREE.CylinderGeometry(CHAIN_R, CHAIN_R, CHAIN_BASE, 6);
    this._chain    = new THREE.Mesh(chainGeo, new THREE.MeshStandardMaterial({
      color: COLOR.CHAIN, metalness: 0.8, roughness: 0.3,
    }));
    this._chain.castShadow = true;
    this._group.add(this._chain);
    this._chainTopY = chainTopY;

    // ── J-Hook ────────────────────────────────────────────────────────────
    this._hook = this._buildHook();
    this._group.add(this._hook);
    this._clickMeshes.push(this._hook.children[0]);

    this.updatePosition(INITIAL_HOIST_POS, INITIAL_HOOK_HEIGHT);
  }

  // ── Telemecanique XLS cross-arm rotary limit switch ──────────────────────

  _buildLimitSwitch(motorY) {
    const switchX = 0; // Centered on X
    const switchY = motorY + 0.05;
    const switchZ = MOTOR_D / 2 + 0.05; // Placed on the front face

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcc1a1a,   // Telemecanique red body
      roughness: 0.4, metalness: 0.3,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x9a9a9a, roughness: 0.3, metalness: 0.85,
    });

    // Main body (rectangular box)
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.08, 0.10); // Swap X and Z dimensions since it's mounted on front
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(switchX, switchY, switchZ - 0.05);
    body.castShadow = true;
    this._group.add(body);
    this._clickMeshes.push(body);

    // Body label plate (grey face)
    const labelGeo = new THREE.BoxGeometry(0.06, 0.06, 0.003); // Swap X and Z
    const label    = new THREE.Mesh(labelGeo, metalMat);
    label.position.set(switchX, switchY, switchZ); // Front face of the body
    this._group.add(label);

    // Conduit entry (cable gland, bottom)
    const gland = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.025, 8),
      metalMat,
    );
    gland.position.set(switchX, switchY - 0.052, switchZ - 0.05);
    this._group.add(gland);

    // ── Cross arm pivot hub ───────────────────────────────────────────────
    // The pivot sits on the front face of the body, arm rotates in XY (wait, no, it should rotate in XZ or XY. If it's on the front face, the pivot extends forward)
    const pivotX = switchX;
    const pivotY = switchY;
    const pivotZ = switchZ;

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12),
      metalMat,
    );
    hub.rotation.x = Math.PI / 2; // Point forward
    hub.position.set(pivotX, pivotY, pivotZ);
    this._group.add(hub);

    // ── Rotating cross arm (4-way cross) ─────────────────────────────────
    this._armPivot = new THREE.Group();
    this._armPivot.position.set(pivotX, pivotY, switchZ);
    this._group.add(this._armPivot);

    const armMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd, roughness: 0.3, metalness: 0.8,
    });
    const ARM_L   = 0.11;   // half-arm length
    const ARM_R   = 0.008;  // arm radius

    // Horizontal bar (main arm)
    const hBar = new THREE.Mesh(
      new THREE.CylinderGeometry(ARM_R, ARM_R, ARM_L * 2, 8),
      armMat,
    );
    hBar.rotation.z = Math.PI / 2;
    this._armPivot.add(hBar);

    // Vertical bar (cross piece)
    const vBar = new THREE.Mesh(
      new THREE.CylinderGeometry(ARM_R, ARM_R, ARM_L * 2, 8),
      armMat,
    );
    this._armPivot.add(vBar);

    // End caps (4 roller-style tips)
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xff8800,   // orange roller tips — classic Telemecanique style
      roughness: 0.3, metalness: 0.4,
    });
    for (const [ox, oy] of [[ARM_L,0],[-ARM_L,0],[0,ARM_L],[0,-ARM_L]]) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 8, 8),
        capMat,
      );
      cap.position.set(ox, oy, 0);
      this._armPivot.add(cap);
    }
  }

  // ── J-Hook geometry ──────────────────────────────────────────────────────

  _buildHook() {
    const group   = new THREE.Group();
    const hookMat = new THREE.MeshStandardMaterial({
      color: COLOR.HOOK, metalness: 0.85, roughness: 0.15,
    });

    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 10), hookMat);
    shank.position.set(0, 0.09, 0);
    group.add(shank);

    const R = 0.10;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -R, 0),
      new THREE.Vector3(R * 0.55, -R * 1.6, 0),
      new THREE.Vector3(R, -R, 0),
      new THREE.Vector3(R * 0.75, -R * 0.35, 0),
    ]);
    const hookBody = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.022, 8, false),
      hookMat,
    );
    hookBody.castShadow = true;
    group.add(hookBody);

    const latch = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.06, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x8a5f00, metalness: 0.7 }),
    );
    latch.position.set(R * 0.5, -R * 0.2, 0);
    latch.rotation.z = -0.4;
    group.add(latch);

    return group;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  updatePosition(hoistPos, hookHeight) {
    this._group.position.x = hoistPos;

    const chainTop = this._chainTopY;
    const chainBot = hookHeight + 0.18;
    const chainLen = chainTop - chainBot;

    if (chainLen > 0.01) {
      this._chain.visible    = true;
      this._chain.scale.y    = chainLen / CHAIN_BASE;
      this._chain.position.y = chainBot + chainLen / 2;
    } else {
      this._chain.visible = false;
    }

    this._hook.position.y = hookHeight;
  }

  /**
   * Animate the cross-arm toward its target angle.
   * Call once per frame with real delta (not time-scaled).
   */
  updateLimitSwitch(delta) {
    if (!this._armPivot) return;
    const diff = this._armTarget - this._armAngle;
    if (Math.abs(diff) < 0.005) {
      this._armAngle = this._armTarget;
    } else {
      this._armAngle += Math.sign(diff) * Math.min(Math.abs(diff), ARM_SPEED * delta);
    }
    // Arm rotates in Z when mounted on side, but when mounted on front it still rotates in XY plane (it spins around the Z axis).
    // Actually, if the pivot is pointing forward (Z axis), the rotation should be around Z. 
    // Yes, this._armPivot.rotation.z is rotation around Z axis.
    this._armPivot.rotation.z = this._armAngle;
  }

  get clickableMeshes() { return this._clickMeshes; }

  setHighlight(active) {
    this._motorMesh.material.emissive          = new THREE.Color(active ? 0x203050 : 0x000000);
    this._motorMesh.material.emissiveIntensity = active ? 0.5 : 0;
  }
}
