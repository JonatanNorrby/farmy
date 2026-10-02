# Farmy 🌱

A cozy, isometric 3D farming prototype built with Babylon.js and plain HTML/CSS/JavaScript. Hosted as a static site on GitHub Pages; no backend or build step.

## Play
- Choose **Carrot**, **Wheat**, or **Pumpkin** in the toolbar (keys **1–3**).
- Click an empty plot to buy and plant a seed.
- Choose the watering can (key **4**) and click a growing plant once to speed it up.
- Click a mature crop with any tool to harvest it, earn coins, and plant again.
- Progress is automatically saved to this browser (localStorage). Crops also grow while the page is closed.
- Mouse wheel zooms; the game works with touch controls too.

## Run locally
Use a local HTTP server (ES modules require one). For example:

```sh
python -m http.server 8000
```

Then open http://localhost:8000.

## Structure
```text
index.html                 App shell and UI
styles.css                 Responsive HUD and styling
src/main.js                Composition root, event wiring, render loop
src/config/crops.js        Crop balancing and fixed farm layout
src/game/farm.js           Pure, testable farm actions and growth logic
src/game/storage.js        Defensive save/load with versioned localStorage
src/render/scene.js        Babylon engine scene, lighting, camera
src/render/world.js        Ground, farm plots, cottage, vegetation
src/render/cropMeshes.js   Procedural 3D crop models
src/ui/interface.js        UI events and presentation
tests/farm.test.js         Node built-in test runner
.github/workflows/pages.yml Static GitHub Pages deployment
```

## Extend
Keep crop/economy rules in `src/game/`, visual implementations in `src/render/`, UI in `src/ui/`, and balancing data in `src/config/`. The world is created from simple Babylon primitives without external textures or 3D assets, leaving room for GLB assets later. A save schema version is included for future migration.

## Deploy
Go to **Settings → Pages → Build and deployment** and set source to **GitHub Actions** (once, if not already enabled). Pushes to `main` trigger `Deploy Farmy to Pages`. The site is expected at https://jonatannorrby.github.io/farmy/.

Babylon.js is loaded via its official CDN, so an internet connection is required when first loading the page.
