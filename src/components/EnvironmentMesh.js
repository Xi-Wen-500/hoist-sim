/**
 * EnvironmentMesh.js
 * Ground plane, structural wall at 5m, LVL1 floor slab, grid floor markings,
 * and building columns for spatial context.
 */

import * as THREE from 'three';
import { BEAM_LENGTH, WALL_X, WALL_HEIGHT, COLOR } from '../utils/constants.js';

export class EnvironmentMesh {
  constructor(scene) {
    this._build(scene);
  }

  _build(scene) {
    // ── Ground plane ─────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(BEAM_LENGTH + 6, 8);
    const groundMat = new THREE.MeshStandardMaterial({
      color: COLOR.GROUND,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(BEAM_LENGTH / 2, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // Ground grid lines (every 1m)
    const gridHelper = new THREE.GridHelper(
      Math.max(BEAM_LENGTH + 4, 12), Math.max(BEAM_LENGTH + 4, 12),
      0x252530, 0x1e1e28,
    );
    gridHelper.position.set(BEAM_LENGTH / 2, 0.001, 0);
    scene.add(gridHelper);

    // ── Wall at 5m horizontal ─────────────────────────────────────────
    // The wall runs from ground (y=0) to LVL1 (y=WALL_HEIGHT) at x=WALL_X
    const wallThick = 0.22;
    const wallGeo = new THREE.BoxGeometry(wallThick, WALL_HEIGHT, 5.0);
    const wallMat = new THREE.MeshStandardMaterial({
      color: COLOR.WALL,
      roughness: 0.7,
      metalness: 0.1,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(WALL_X, WALL_HEIGHT / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    // Wall edge orange highlight
    const wallEdges = new THREE.EdgesGeometry(wallGeo, 10);
    wall.add(new THREE.LineSegments(
      wallEdges,
      new THREE.LineBasicMaterial({ color: COLOR.WALL_E, transparent: true, opacity: 0.5 }),
    ));

    // Wall arrow marker (shows danger zone / height)
    const arrowMat = new THREE.LineBasicMaterial({ color: COLOR.WALL_E });
    const pts = [
      new THREE.Vector3(WALL_X + wallThick * 0.6, 0, 0),
      new THREE.Vector3(WALL_X + wallThick * 0.6, WALL_HEIGHT, 0),
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arrowMat));

    // ── LVL1 floor slab (left of wall, at 4m height) ──────────────────
    const slabGeo = new THREE.BoxGeometry(WALL_X - 0.214, 0.14, 4.5);
    const slabMat = new THREE.MeshStandardMaterial({
      color: COLOR.GROUND, roughness: 0.8, metalness: 0.2,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set((WALL_X + 0.5) / 2 - 0.25, WALL_HEIGHT - 0.07, 0);
    slab.receiveShadow = true;
    scene.add(slab);

    // Floor slab edge
    const slabEdges = new THREE.EdgesGeometry(slabGeo, 5);
    slab.add(new THREE.LineSegments(
      slabEdges,
      new THREE.LineBasicMaterial({ color: 0x3a3a48, transparent: true, opacity: 0.6 }),
    ));



    // ── Height reference marks on wall ────────────────────────────────
    const tickMat = new THREE.LineBasicMaterial({ color: 0x3a3a50 });
    for (let h = 1; h <= 10; h++) {
      const tickLen = h % 5 === 0 ? 0.3 : 0.15;
      const tickPts = [
        new THREE.Vector3(WALL_X + wallThick * 0.5, h, -0.1),
        new THREE.Vector3(WALL_X + wallThick * 0.5 + tickLen, h, -0.1),
      ];
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(tickPts), tickMat,
      ));
    }
  }
}
