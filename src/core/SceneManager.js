/**
 * SceneManager.js
 * Owns the Three.js scene graph and all 3D components.
 */

import * as THREE from 'three';
import { BG_COLORS, DEFAULT_BG } from '../utils/constants.js';

import { IBeamMesh }       from '../components/IBeamMesh.js';
import { HoistMesh }       from '../components/HoistMesh.js';
import { BigBagMesh }      from '../components/BigBagMesh.js';
import { PalletMesh }      from '../components/PalletMesh.js';
import { ShutterDoor }     from '../components/ShutterDoor.js';
import { TippingHopper }   from '../components/TippingHopper.js';
import { EnvironmentMesh } from '../components/EnvironmentMesh.js';
import { LimitMarkers }    from '../components/LimitMarkers.js';
import { LightingSystem }  from '../systems/LightingSystem.js';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLORS[DEFAULT_BG]);
    this.scene.fog = new THREE.Fog(BG_COLORS[DEFAULT_BG], 40, 120);
    this._buildScene();
  }

  _buildScene() {
    this.lighting      = new LightingSystem(this.scene);
    this.environment   = new EnvironmentMesh(this.scene);
    this.iBeam         = new IBeamMesh(this.scene);
    this.hoist         = new HoistMesh(this.scene);
    this.bigBag        = new BigBagMesh(this.scene);
    this.pallet        = new PalletMesh(this.scene);      // static, stays at HOME_X
    this.shutterDoor   = new ShutterDoor(this.scene);     // at HOME_X ground floor
    this.tippingHopper = new TippingHopper(this.scene);
    this.limitMarkers  = new LimitMarkers(this.scene);
  }

  setBackground(key) {
    const hex = BG_COLORS[key] ?? BG_COLORS['dark-grey'];
    this.scene.background = new THREE.Color(hex);
    this.scene.fog        = new THREE.Fog(hex, 40, 120);
  }

  getClickableObjects() {
    if (this._clickMap) return this._clickMap;
    this._clickMap = new Map([
      ...this.hoist.clickableMeshes.map(m         => [m, 'hoist']),
      ...this.iBeam.clickableMeshes.map(m         => [m, 'ibeam']),
      ...this.bigBag.clickableMeshes.map(m        => [m, 'bigbag']),
      ...this.tippingHopper.clickableMeshes.map(m => [m, 'tank']),
    ]);
    return this._clickMap;
  }

  setHighlight(componentName) {
    [this.hoist, this.iBeam, this.bigBag, this.tippingHopper]
      .forEach(c => c.setHighlight(false));
    if (!componentName) return;
    const map = {
      hoist:  this.hoist,
      ibeam:  this.iBeam,
      bigbag: this.bigBag,
      tank:   this.tippingHopper,
    };
    map[componentName]?.setHighlight(true);
  }
}
