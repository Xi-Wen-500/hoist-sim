/**
 * BigBagMesh.js
 * FIBC 1-tonne big bag — BAG ONLY, no pallet.
 * Follows the hoist hook position (hoistPos, hookHeight).
 * The pallet is a separate static component (PalletMesh.js).
 */

import * as THREE from 'three';
import {
  INITIAL_HOIST_POS, INITIAL_HOOK_HEIGHT,
  BAG_HEIGHT, COLOR,
} from '../utils/constants.js';

const BAG_W  = 0.92;  // base width/depth
const BAG_WT = 0.78;  // top width/depth (tapered)

export class BigBagMesh {
  constructor(scene) {
    this._group       = new THREE.Group();
    this._clickMeshes = [];
    this._build();
    this._group.position.set(INITIAL_HOIST_POS, 0, 0);
    scene.add(this._group);
  }

  _build() {
    // ── Tapered bag body ──────────────────────────────────────────────────
    const bagMat = new THREE.MeshStandardMaterial({
      color:     COLOR.BIG_BAG,
      roughness: 0.9,
      metalness: 0.0,
    });

    const hw  = BAG_W  / 2;
    const hwt = BAG_WT / 2;
    const bh  = BAG_HEIGHT;

    const verts = new Float32Array([
      -hw, 0,  hw,   hw, 0,  hw,   hw, 0, -hw,  -hw, 0, -hw,
      -hwt, bh,  hwt,  hwt, bh,  hwt,  hwt, bh, -hwt, -hwt, bh, -hwt,
    ]);
    const indices = [
      0,2,1, 0,3,2,   // bottom
      4,5,6, 4,6,7,   // top
      0,1,5, 0,5,4,   // front
      2,3,7, 2,7,6,   // back
      1,2,6, 1,6,5,   // right
      3,0,4, 3,4,7,   // left
    ];

    const bagGeo = new THREE.BufferGeometry();
    bagGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    bagGeo.setIndex(indices);
    bagGeo.computeVertexNormals();

    this._bagMesh = new THREE.Mesh(bagGeo, bagMat);
    this._bagMesh.castShadow = true;
    this._group.add(this._bagMesh);
    this._clickMeshes.push(this._bagMesh);

    // Edge seams
    this._bagMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(bagGeo),
      new THREE.LineBasicMaterial({ color: COLOR.BIG_BAG_E }),
    ));

    // ── Corner lifting straps ─────────────────────────────────────────────
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x5a4010, roughness: 0.9 });
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * hwt * 0.6, bh,         sz * hwt * 0.6),
        new THREE.Vector3(sx * hwt * 0.3, bh + 0.12,  sz * hwt * 0.3),
        new THREE.Vector3(0,              bh + 0.20,   0),
      ]);
      this._bagMesh.add(new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, 0.015, 4, false),
        strapMat,
      ));
    }

    // ── Filling spout (top) ───────────────────────────────────────────────
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.95 }),
    );
    spout.position.set(0, bh + 0.09, 0);
    this._bagMesh.add(spout);

    this.updatePosition(INITIAL_HOIST_POS, INITIAL_HOOK_HEIGHT);
  }

  /**
   * Called every frame.
   * @param {number} hoistPos   world X of hoist (follows beam position)
   * @param {number} hookHeight world Y of hook bottom
   */
  updatePosition(hoistPos, hookHeight) {
    // Bag travels with the hoist X position
    this._group.position.x = hoistPos;
    // Bag base sits at hookHeight (hook lifts the bag by its straps)
    this._bagMesh.position.y = hookHeight;
  }

  get clickableMeshes() { return this._clickMeshes; }

  setHighlight(active) {
    this._bagMesh.material.emissive          = new THREE.Color(active ? 0x3a2010 : 0x000000);
    this._bagMesh.material.emissiveIntensity = active ? 0.5 : 0;
  }
}
