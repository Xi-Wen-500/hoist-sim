# Hoist Simulator

Interactive chain hoist tipping station simulator built with Vite + Three.js.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Project Structure

```
hoist-sim/
├── assets/
│   ├── models/          # GLTF/GLB models (if added later)
│   └── textures/        # Texture maps
│
├── src/
│   ├── components/      # 3D mesh builders
│   │   ├── IBeamMesh.js         — Monorail I-beam
│   │   ├── HoistMesh.js         — Hoist body, chain, hook
│   │   ├── BigBagMesh.js        — Big bag + pallet
│   │   ├── TippingHopper.js     — Tank / tipping station
│   │   ├── EnvironmentMesh.js   — Ground, wall, LVL1 floor
│   │   └── LimitMarkers.js      — H/L limit visual indicators
│   │
│   ├── core/            # Three.js core setup
│   │   ├── SceneManager.js      — Scene graph owner
│   │   ├── CameraManager.js     — Orthographic camera + pan/zoom
│   │   └── RendererManager.js   — WebGLRenderer + resize
│   │
│   ├── systems/         # Logic & controllers
│   │   ├── AnimationLoop.js     — requestAnimationFrame loop
│   │   ├── LightingSystem.js    — Scene lighting
│   │   ├── HoistController.js   — State machine (manual + auto sequences)
│   │   ├── InteractionSystem.js — Keyboard, D-pad, raycasting
│   │   └── UIController.js      — DOM sync, sidebar, settings, inspect panel
│   │
│   ├── utils/
│   │   ├── constants.js         — All system parameters (H/L limits, speeds)
│   │   └── mathHelpers.js       — lerp, clamp, EventBus, formatters
│   │
│   └── main.js          — Entry point
│
├── styles/
│   └── main.css         — Full UI styling
│
├── index.html           — HTML shell + sidebar DOM
├── vite.config.js
└── package.json
```

## System Parameters (constants.js)

| Parameter | Value |
|-----------|-------|
| H1 (upper lift limit)  | 9.2m |
| H2 (speed transition)  | 8.0m |
| H3 (speed transition)  | 1.8m |
| H4 (lower lift limit)  | 1.2m |
| L1 (cross-travel)      | 7.8m |
| L2                     | 5.5m |
| L3                     | 4.0m |
| L4                     | 3.1m |
| Stopper A              | 2.9m |
| Stopper B              | 8.1m |
| Wall                   | 5.0m |
| Slow lift speed        | ~1 m/min |
| Fast lift speed        | ~4 m/min |

## Controls

| Key | Action |
|-----|--------|
| W   | Lift chain |
| S   | Lower chain |
| A   | Cross-travel left |
| D   | Cross-travel right |
| Shift | High speed (lift only) |
| Space | Emergency stop |
| Enter | Reset after E-Stop |

## Adding Inspection Documents

Edit `src/systems/UIController.js` → `_showInspect()` → `COMPONENTS` object.
Uncomment and fill in asset entries:

```js
hoist: {
  label: 'CHAIN HOIST (1.5t)',
  assets: [
    { type: 'PDF', label: 'Hoist Manual', href: '/assets/docs/hoist-manual.pdf' },
    { type: 'VID', label: 'Maintenance Video', href: '/assets/docs/video.mp4' },
  ],
},
```

Place files in `assets/docs/` and they will be served by Vite.

## Build

```bash
npm run build    # outputs to /dist
npm run preview  # preview production build locally
```
