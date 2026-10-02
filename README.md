# Farmy 🌱

A cozy, isometric 3D farming prototype in Babylon.js and vanilla HTML/CSS/JS, deployed to GitHub Pages.

## Play
- **Paint soil:** Choose **Plot (4)** and click-drag across owned grass. It lays overlapping round patches along your brush stroke for **3 coins per new mark**. Painting over existing soil is free; the farm no longer has a visible or interactive tile grid.
- **Shop:** Open the **Shop** button beside Settings. It has two tabs: **Seeds** and **Buildings**. Seeds sells a **bag of 10 wheat seeds for 30 coins**; Buildings sells **one sprinkler for 36 coins**. Purchases are stored in inventory.
- **Plant:** Buy a wheat seed bag first, choose **Wheat (1)** and **left-drag across prepared soil** to draw seeds onto it. A fast drag fills every empty patch touched, consuming **one stored seed per newly planted spot** from your ten-seed bag. Occupied soil is skipped, drawing over planted crops is free, and painting stops when the bag is empty. A short click still plants a single empty spot or harvests a mature crop. Remaining seeds appear on the tool. Older saved carrots and pumpkins still grow and can be harvested, but cannot be replanted.
- **Water:** Choose **Water (2)** and click a growing plant for a one-time growth boost.
- **Sprinkler:** Buy one in **Shop → Buildings**, then choose **Sprinkler (3)** and click empty soil to place it. Placement consumes your purchased sprinkler rather than charging again. It automatically waters nearby growing and newly planted crops without stacking bonuses.
- Click mature wheat to harvest it. Brush-painting applies only to soil preparation; sowing and harvesting still use clicks.
- Expand the owned land via **Expand land** for **85**, then **180** coins. New land is continuous grass ready for freeform soil painting.
- New farms start with **64 coins**, four prepared soil marks and empty shop inventory: buy your first seed bag to begin. Older v1–v5 saves migrate with previous crops, sprinklers, soil, coins and land intact; they also receive a starting bag of 10 wheat seeds.
- Progress automatically saves in the current browser; crops also grow while the page is closed.
- **Camera:** Hold **WASD** to pan relative to the isometric view. With Wheat selected, **left-drag from prepared soil to paint seeds**; left-drag from grass pans the camera. With Water or Sprinkler, left-drag pans. **Right-drag** always pans (including Wheat and Plot) without spending inventory. Plot left-drag continues painting soil. Short clicks retain single-item actions. Mouse wheel zooms, and panning respects the farm bounds.
- **⚙ Settings** adjusts brightness from 50–150%, persisted separately from farm progress.

## Run locally
Use a local HTTP server because ES modules require one:

```sh
python -m http.server 8000
npm test
```

Open http://localhost:8000.

## Structure
```text
index.html                  App shell and HUD
styles.css                  Responsive styling
src/main.js                 Input/brush orchestration and render loop
src/config/crops.js         World boundaries, brush settings, historical crop catalog
src/config/shop.js          Seeds and Buildings offers, bundle sizes and inventory limits
src/game/farm.js            Pure soil/seed strokes, shop purchases, inventory and farm economy
src/game/storage.js         Validated v1–v5 to v6 browser save migration
src/game/settings.js        Independent brightness preference
src/render/scene.js         Babylon engine, warm lighting, fixed isometric camera
src/render/cameraMovement.js Screen-relative WASD and drag panning with movement limits
src/render/world.js         Continuous terrain and overlapping painted soil marks
src/render/cropMeshes.js    Procedural crop models
src/render/sprinklerMeshes.js Procedural spinning sprinkler
src/render/watering.js      Reusable watering particle feedback
src/ui/interface.js         Shop tabs, tool stock counters, inspector and settings
tests/farm.test.js          Soil brush, stock-aware crops, sprinklers and migrations
tests/shop.test.js          Shop purchase rules, inventory safety and older save migration
tests/planting.test.js      Seed brush strokes, depletion, occupancy and persistence
tests/interface.test.js     Shop tab interactions, purchase callbacks and stock UI
tests/world.test.js         Ground composition and painted soil render tests
tests/cameraMovement.test.js Camera direction, drag, zoom and keyboard movement tests
tests/cropMeshes.test.js    Wheat growth/geometry tests
tests/settings.test.js      Display preference tests
.github/workflows/pages.yml GitHub Pages deploy with Node tests
```

The active game stores positions, not tile indices. The old 5×4 grid remains only in save migration, so historic farms can load without losing progress.

## Deploy
In **Settings → Pages → Build and deployment**, use **GitHub Actions** as the source. Pushes to `main` trigger the workflow. The site is expected at https://jonatannorrby.github.io/farmy/. Babylon.js loads from its official CDN and needs an internet connection.
