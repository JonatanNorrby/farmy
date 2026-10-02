# Farmy 🌱

A cozy, isometric 3D farming prototype built with Babylon.js and plain HTML/CSS/JavaScript. Hosted as a static site on GitHub Pages; no backend or build step.

## Play
- **Wheat** is the only available seed (**1**). Existing saved carrots/pumpkins can still finish growing, receive water and be harvested, but cannot be replanted.
- New farms own **10 land tiles** and start with **four prepared soil plots**. Click a prepared empty plot to plant wheat.
- Select **Plot** (key **4**) and click any *owned grassy tile* to prepare a new soil plot for **12 coins**. Place plots wherever you prefer within your owned land; grass is not plantable until prepared.
- Choose the watering can (key **2**) and click a growing plant once to speed it up, with a droplet-and-splash particle animation.
- Choose **Sprinkler** (key **3**) and place it on an empty prepared soil plot for **36 coins**. It permanently occupies that plot and immediately waters any of the eight neighboring growing crops. Newly planted neighboring crops are automatically watered too (the one-time watering boost does not stack). Water jets and splashes show when automatic watering happens.
- Click a mature crop with any tool to harvest it, earn coins, and plant again.
- Wheat grows from six sparse green shoots into a dense patch of 25 golden, blocky stalks with fuller grain heads. The model is batched by material to keep the extra detail lightweight.
- Only the farm remains in the 3D scene: a plain farm-sized base, expandable owned lawn, interactive soil/grass plots, crops, sprinklers and interaction effects. The surrounding island, cottage, pond, trees, flowers, path, fences and other decorative objects have been removed.
- Expand the underlying farm land by a row of five tiles for **85** then **180** coins by clicking unowned land or the **+5 land** button. Newly purchased land remains grass until you individually create farm plots.
- Old v1–v3 saves migrate automatically: previously owned land remains owned and **all previously available plots remain prepared**, preserving crops, sprinklers, harvests and coins.
- Progress is automatically saved to this browser (localStorage). Crops also grow while the page is closed.
- Mouse wheel zooms; the game works with touch controls too.
- Open **⚙ Settings** beside the logo to adjust **Brightness (50–150%)** in real time, or reset it to **100%**. The warm sunlight colors stay the same; only scene exposure changes. This preference persists across reloads and is stored separately from farm progress.

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
src/config/crops.js        Crop balancing, starter soil, plot and land-expansion costs/geometry
src/game/farm.js           Pure crop, sprinkler, land expansion and plot preparation logic
src/game/storage.js        Defensive save/load with v1–v3 → v4 migration
src/game/settings.js       Independent local display preference and exposure mapping
src/render/scene.js        Babylon engine scene, lighting, camera
src/render/world.js        Farm-only ground, interactive plots and crop/sprinkler placement
src/render/cropMeshes.js   Procedural 3D crop models, including denser golden wheat
src/render/watering.js     Reusable, self-cleaning watering particles
src/render/sprinklerMeshes.js Procedural rotating sprinkler
src/ui/interface.js        UI events and presentation
tests/farm.test.js         Farm logic tests
tests/cropMeshes.test.js   Wheat growth, color progression and mesh batching tests
tests/world.test.js        Farm-only composition, picking and visual plot states
tests/settings.test.js     Brightness and display preference tests
.github/workflows/pages.yml Static GitHub Pages deployment
```

## Extend
Keep crop/economy rules in `src/game/`, visual implementations in `src/render/`, UI in `src/ui/`, and balancing data in `src/config/`. The farm is created from simple Babylon primitives and in-memory particle textures without external textures or 3D assets, leaving room for GLB assets later. The save schema migrates earlier gardens without removing legacy crops or purchased land, or undoing their existing soil plots. The planting whitelist is separate from the historical crop catalog, allowing future crop availability changes without breaking saves.

## Deploy
Go to **Settings → Pages → Build and deployment** and set source to **GitHub Actions** (once, if not already enabled). Pushes to `main` trigger `Deploy Farmy to Pages`. The site is expected at https://jonatannorrby.github.io/farmy/.

Babylon.js is loaded via its official CDN, so an internet connection is required when first loading the page.
