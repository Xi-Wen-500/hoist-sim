/**
 * TippingHopper.js
 * Tipping station (tank) at TANK_X (3m), height TANK_HEIGHT (4m).
 * Shutter door has been moved to ShutterDoor.js at HOME_X ground level.
 */

import * as THREE from 'three';
import { TANK_X, TANK_HEIGHT, COLOR } from '../utils/constants.js';

export class TippingHopper {
  constructor(scene) {
    this._group       = new THREE.Group();
    this._clickMeshes = [];
    this._build();
    scene.add(this._group);
  }

  _build() {
    const cx = TANK_X;
    const cy = TANK_HEIGHT;

    // ── Skeletal Support frame (4 square tubular legs + cross-bracing) ────────
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x8a929a, roughness: 0.3, metalness: 0.8, // Bright stainless steel
    });

    const legH = cy + 0.8; // Extend legs slightly past the pan
    const legW = 0.04;
    const legOffset = 0.55;

    // 4 Corner Legs
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx, dz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legW), steelMat);
      leg.position.set(cx + dx * legOffset, legH / 2, dz * legOffset);
      leg.castShadow = true;
      this._group.add(leg);
    });

    // Horizontal Bracing (top, mid, bottom)
    const braceHeights = [cy + 0.7, cy - 0.2, cy * 0.4];
    braceHeights.forEach((bh) => {
      // Z-axis braces
      for (const dx of [-1, 1]) {
        const braceZ = new THREE.Mesh(new THREE.BoxGeometry(legW, legW, legOffset * 2), steelMat);
        braceZ.position.set(cx + dx * legOffset, bh, 0);
        this._group.add(braceZ);
      }
      // X-axis braces
      for (const dz of [-1, 1]) {
        const braceX = new THREE.Mesh(new THREE.BoxGeometry(legOffset * 2, legW, legW), steelMat);
        braceX.position.set(cx, bh, dz * legOffset);
        this._group.add(braceX);
      }
    });

    // ── Receiving tipping pan (square frustum) ────────────────────────────────
    const panMat = new THREE.MeshStandardMaterial({
      color: 0xdde5ee, roughness: 0.4, metalness: 0.7,
    });
    const panH = 0.50;
    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength)
    // 4 radial segments makes a square pyramid frustum. 
    // We want a wide top and narrow bottom. Radius is distance to corners.
    const panGeo = new THREE.CylinderGeometry(
      0.60 * Math.sqrt(2), 0.15 * Math.sqrt(2), panH, 4, 1, false, Math.PI / 4,
    );
    this._hopperMesh = new THREE.Mesh(panGeo, panMat);
    this._hopperMesh.position.set(cx, cy + panH / 2 + 0.05, 0);
    this._hopperMesh.castShadow = true;
    this._group.add(this._hopperMesh);
    this._clickMeshes.push(this._hopperMesh);

    this._hopperMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(panGeo, 10),
      new THREE.LineBasicMaterial({ color: 0x9a9ca0 }),
    ));

    // Blue sealing rim around the top edge to match reference image
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x0033cc, roughness: 0.6, metalness: 0.2 });
    for (const [ox, oz, rot] of [[0,0.6,0],[0,-0.6,0],[0.6,0,Math.PI/2],[-0.6,0,Math.PI/2]]) {
      const rimEdge = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.015, 0.04), rimMat);
      rimEdge.position.set(cx + ox, cy + panH + 0.05, oz);
      rimEdge.rotation.y = rot;
      this._group.add(rimEdge);
    }

    // Secondary discharge chamber / filter house below the pan
    const chamber = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.18, 0.25, 12),
      steelMat,
    );
    chamber.position.set(cx, cy - 0.15, 0);
    this._group.add(chamber);

    // Outlet pipe fitting
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.35, 12),
      steelMat,
    );
    pipe.position.set(cx, cy - 0.40, 0);
    this._group.add(pipe);

    // Side filter hatch / cleanout port (circular disc on chamber)
    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12),
      steelMat,
    );
    hatch.rotation.z = Math.PI / 2;
    hatch.position.set(cx + 0.20, cy - 0.15, 0);
    this._group.add(hatch);

    // Minimal operator panel block on front brace
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x242b3d, roughness: 0.6, metalness: 0.5 }),
    );
    panel.position.set(cx, cy * 0.4 + 0.08, 0.55 + 0.04);
    this._group.add(panel);

    // Panel LED
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x3ddc84, emissiveIntensity: 0.5 }),
    );
    led.position.set(cx, cy * 0.4 + 0.08, 0.55 + 0.07);
    this._group.add(led);
  }

  // No per-frame update needed — static component
  update() {}

  get clickableMeshes() { return this._clickMeshes; }

  setHighlight(active) {
    this._hopperMesh.material.emissive          = new THREE.Color(active ? 0x0a3010 : 0x000000);
    this._hopperMesh.material.emissiveIntensity = active ? 0.5 : 0;
  }
}
