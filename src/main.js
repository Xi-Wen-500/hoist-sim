/**
 * main.js — Entry point
 */

import { RendererManager }   from './core/RendererManager.js';
import { SceneManager }      from './core/SceneManager.js';
import { CameraManager }     from './core/CameraManager.js';
import { HoistController }   from './systems/HoistController.js';
import { InteractionSystem } from './systems/InteractionSystem.js';
import { UIController }      from './systems/UIController.js';
import { AnimationLoop }     from './systems/AnimationLoop.js';

const canvas = document.getElementById('sim-canvas');

const renderer    = new RendererManager(canvas);
const scene       = new SceneManager();
const camera      = new CameraManager(canvas);
const controller  = new HoistController();
const interaction = new InteractionSystem(canvas, controller, scene, camera);
const ui          = new UIController(renderer, camera, scene);
const loop        = new AnimationLoop(renderer, scene, camera);

// 1. Hoist physics / state machine  (raw delta — HoistController applies timeScale internally)
loop.register((delta) => {
  controller.update(delta);
});

// 2. Sync 3D positions + animate all stateful components
loop.register((delta) => {
  const h = controller.hookHeight;
  const p = controller.hoistPos;

  // Hoist trolley + chain + hook moves with hoist position
  scene.hoist.updatePosition(p, h);

  // Limit switch arm animation uses RAW delta (not time-scaled) so it looks physical
  scene.hoist.updateLimitSwitch(delta);

  // Big bag follows hoist (bag only — pallet stays on ground)
  scene.bigBag.updatePosition(p, h);

  // Shutter door slides open/closed
  scene.shutterDoor.update(delta);
});

loop.start();

if (import.meta.env?.DEV) {
  window.__sim = { controller, scene, camera, renderer, loop };
  console.log('[HoistSim] Dev mode — window.__sim available');
}
