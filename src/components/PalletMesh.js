/**
 * PalletMesh.js
 * Euro pallet that stays permanently on the ground at HOME_X.
 * It does NOT follow the hoist — only the bag does.
 */

import * as THREE from 'three';
import { HOME_X } from '../utils/constants.js';

const PAL_W = 1.05;
const PAL_H = 0.12;

export class PalletMesh {
  constructor(scene) {
    this._group = new THREE.Group();
    this._clickMeshes = [];
    this._build();
    this._group.position.set(HOME_X, 0, 0);
    scene.add(this._group);
  }

  _build() {
    const palMat = new THREE.MeshStandardMaterial({
      color: 0x7a5a2a, roughness: 0.85, metalness: 0.0,
    });

    // Top deck board
    const deckGeo = new THREE.BoxGeometry(PAL_W, 0.022, PAL_W);
    const deck    = new THREE.Mesh(deckGeo, palMat);
    deck.position.y = PAL_H - 0.011;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this._group.add(deck);
    this._clickMeshes.push(deck);

    // Three stringers (vertical blocks)
    for (const dx of [-0.36, 0, 0.36]) {
      const sGeo = new THREE.BoxGeometry(0.09, PAL_H - 0.022, PAL_W);
      const s    = new THREE.Mesh(sGeo, palMat);
      s.position.set(dx, (PAL_H - 0.022) / 2, 0);
      s.castShadow = true;
      s.receiveShadow = true;
      this._group.add(s);
    }

    // Bottom deck board
    const bdGeo = new THREE.BoxGeometry(PAL_W, 0.018, PAL_W);
    const bd    = new THREE.Mesh(bdGeo, palMat);
    bd.position.y = 0.009;
    bd.castShadow = true;
    bd.receiveShadow = true;
    this._group.add(bd);
  }

  get clickableMeshes() { return this._clickMeshes; }
  setHighlight() {}   // no highlight needed for static pallet
}
