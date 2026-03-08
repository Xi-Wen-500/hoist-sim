/**
 * IBeamMesh.js
 * Proper IPE-220 monorail I-beam, extruded along world X axis.
 * Both ends are fixed to building structure via welded gusset plates + anchor bolts.
 */

import * as THREE from 'three';
import { BEAM_LENGTH, BEAM_HEIGHT, COLOR } from '../utils/constants.js';

// ── Profile constants (metres) ────────────────────────────────────────────────
const FLANGE_W = 0.22;
const FLANGE_T = 0.032;
const WEB_H    = 0.15;
const WEB_T    = 0.016;
const TOTAL_H  = WEB_H + 2 * FLANGE_T;   // 0.214 m

export { TOTAL_H as BEAM_TOTAL_H, FLANGE_W as BEAM_FLANGE_W };

export class IBeamMesh {
  constructor(scene) {
    this._group       = new THREE.Group();
    this._clickMeshes = [];
    this._mainMesh    = null;
    this._build();
    scene.add(this._group);
  }

  _build() {
    this._buildBeam();
    this._buildEndBrackets();
  }

  // ── Extruded I-profile ──────────────────────────────────────────────────────
  _buildBeam() {
    const fw = FLANGE_W / 2;
    const ft = FLANGE_T;
    const wt = WEB_T / 2;
    const h  = TOTAL_H / 2;

    const shape = new THREE.Shape();
    shape.moveTo(-fw, -h);
    shape.lineTo( fw, -h);
    shape.lineTo( fw, -h + ft);
    shape.lineTo( wt, -h + ft);
    shape.lineTo( wt,  h - ft);
    shape.lineTo( fw,  h - ft);
    shape.lineTo( fw,  h);
    shape.lineTo(-fw,  h);
    shape.lineTo(-fw,  h - ft);
    shape.lineTo(-wt,  h - ft);
    shape.lineTo(-wt, -h + ft);
    shape.lineTo(-fw, -h + ft);
    shape.lineTo(-fw, -h);

    const geo = new THREE.ExtrudeGeometry(shape, { depth: BEAM_LENGTH, bevelEnabled: false });
    const mat = new THREE.MeshStandardMaterial({ color: COLOR.BEAM, roughness: 0.55, metalness: 0.55 });

    const mesh = new THREE.Mesh(geo, mat);
    // Rotate so extrusion (local +Z) aligns to world +X → beam spans 0 to BEAM_LENGTH
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(0, BEAM_HEIGHT, 0);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    this._group.add(mesh);
    this._clickMeshes.push(mesh);
    this._mainMesh = mesh;

    // Edge highlight
    mesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 20),
      new THREE.LineBasicMaterial({ color: COLOR.BEAM_EDGE }),
    ));
  }

  // ── Structural end brackets (both ends fixed to wall/column) ───────────────
  _buildEndBrackets() {
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x263848, roughness: 0.5, metalness: 0.7,
    });
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x445566, roughness: 0.3, metalness: 0.9,
    });
    const weldMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.95, metalness: 0.1,
    });

    [0, BEAM_LENGTH].forEach((x, side) => {
      const dir = side === 0 ? -1 : 1;   // outward direction

      // ── End-plate (bolted to structural wall) ──────────────────────────
      const epGeo = new THREE.BoxGeometry(0.018, TOTAL_H + 0.08, FLANGE_W + 0.08);
      const ep    = new THREE.Mesh(epGeo, bracketMat);
      ep.position.set(x + dir * 0.009, BEAM_HEIGHT, 0);
      ep.castShadow = true;
      this._group.add(ep);

      // ── Top & bottom gusset plates (triangular stiffeners) ─────────────
      // Top gusset — welds top flange to end-plate
      const topGusset = this._makeGussetPlate(0.20, 0.18, 0.012);
      topGusset.position.set(x + dir * 0.07, BEAM_HEIGHT + TOTAL_H / 2 - 0.016, 0);
      topGusset.rotation.y = side === 0 ? 0 : Math.PI;
      this._group.add(topGusset);

      // Bottom gusset
      const botGusset = this._makeGussetPlate(0.20, 0.18, 0.012);
      botGusset.position.set(x + dir * 0.07, BEAM_HEIGHT - TOTAL_H / 2 + 0.016, 0);
      botGusset.rotation.y = side === 0 ? 0 : Math.PI;
      botGusset.rotation.z = Math.PI;
      this._group.add(botGusset);

      // ── Anchor bolts (4 per end-plate, 2 rows × 2 cols) ───────────────
      const boltPositions = [
        [-FLANGE_W * 0.28,  TOTAL_H * 0.30],
        [ FLANGE_W * 0.28,  TOTAL_H * 0.30],
        [-FLANGE_W * 0.28, -TOTAL_H * 0.30],
        [ FLANGE_W * 0.28, -TOTAL_H * 0.30],
      ];
      boltPositions.forEach(([bz, by]) => {
        // Bolt shank
        const shankGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8);
        const shank    = new THREE.Mesh(shankGeo, boltMat);
        shank.rotation.z = Math.PI / 2;
        shank.position.set(x + dir * 0.04, BEAM_HEIGHT + by, bz);
        this._group.add(shank);

        // Hex nut
        const nutGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.014, 6);
        const nut    = new THREE.Mesh(nutGeo, boltMat);
        nut.rotation.z = Math.PI / 2;
        nut.position.set(x + dir * 0.022, BEAM_HEIGHT + by, bz);
        this._group.add(nut);
      });

      // ── Weld fillet (thin strip along flange/end-plate joint) ─────────
      const weldGeo = new THREE.BoxGeometry(0.006, 0.008, FLANGE_W);
      [-TOTAL_H / 2 + FLANGE_T / 2, TOTAL_H / 2 - FLANGE_T / 2].forEach(wy => {
        const weld = new THREE.Mesh(weldGeo, weldMat);
        weld.position.set(x + dir * 0.014, BEAM_HEIGHT + wy, 0);
        this._group.add(weld);
      });

      // ── Stiffener web plate (vertical plate inside the web) ────────────
      const stiffGeo = new THREE.BoxGeometry(0.16, WEB_H, 0.010);
      const stiff    = new THREE.Mesh(stiffGeo, bracketMat);
      stiff.position.set(x + dir * 0.08, BEAM_HEIGHT, 0);
      this._group.add(stiff);
    });
  }

  // ── Triangular gusset plate via custom geometry ─────────────────────────────
  _makeGussetPlate(width, height, depth) {
    const verts = new Float32Array([
      0,      0,      -depth / 2,
      width,  0,      -depth / 2,
      0,     -height, -depth / 2,
      0,      0,       depth / 2,
      width,  0,       depth / 2,
      0,     -height,  depth / 2,
    ]);
    const idx = [0,1,2, 3,4,5, 0,3,4, 0,4,1, 1,4,5, 1,5,2, 2,5,3, 2,3,0];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x263848, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide,
    }));
  }

  get clickableMeshes() { return this._clickMeshes; }

  setHighlight(active) {
    this._mainMesh.material.emissive          = new THREE.Color(active ? 0x1a3060 : 0x000000);
    this._mainMesh.material.emissiveIntensity = active ? 0.4 : 0;
  }
}
