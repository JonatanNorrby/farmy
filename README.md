# Farmy 🌱

A cozy, isometric 3D farming prototype in Babylon.js and vanilla HTML/CSS/JS, deployed to GitHub Pages.

## Play
- **Paint soil:** Choose **Plot (4)** and click-drag across owned grass. The brush merges overlapping marks into a **single painted soil surface** for **3 coins per new dab**. The marks describe where soil exists; they are not planting slots. Painting over prepared soil is free.
- **Shop:** Open the **Shop** button beside Settings. It has two tabs: **Seeds** and **Buildings**. Seeds sells a **bag of 10 wheat seeds for 30 coins**; Buildings sells **one sprinkler for 36 coins**. Purchases are stored in inventory.
- **Plant:** Buy a wheat seed bag first, choose **Wheat (1)** and **left-drag across prepared soil**. A world-space brush plants seeds throughout its swept footprint, even **between soil-dab centers**; wide prepared areas can produce multiple rows from one stroke. Each new plant has its own exact position, growth timer and spacing. Strokes skip occupied positions without spending seeds and stop when the ten-seed bag runs out. A short click places one crop at the clicked point or collects a mature crop. Older saved carrots and pumpkins still grow and can be harvested, but cannot be replanted.
- **Water:** Choose **Water (2)** and click a growing plant for a one-time growth boost.
- **Sprinkler:** Buy one in **Shop → Buildings**, then choose **Sprinkler (3)** and click a clear point on painted soil to place it. Buildings are independently positioned, not tied to a plot center. It consumes purchased inventory and waters nearby growing and newly planted crops without stacking bonuses.
- **Harvest bag:** Click a mature crop to collect it into your **10-crop harvest bag**; collecting does not award coins immediately. Once the bag is full, you cannot collect more until you use **Sell** beside the bag counter in the top bar. Sell pays out the value of all stored crops at once (including any old carrots/pumpkins) and empties the bag, so harvesting can resume. Selling a partially filled bag is also possible.
- Expand the owned land via **Expand land** for **85**, then **180** coins. New land is continuous grass ready for freeform soil painting.
- New farms start with **64 coins**, four initial soil dabs, empty shop inventory and an empty harvest bag. Existing v1–v7 saves migrate to v8, separating previously planted crops and sprinklers from their original soil positions while preserving their coordinates, crop timers, inventory, harvest bag (where present), coins and owned land. Pre-shop saves receive 10 starting wheat seeds.
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
src/config/harvest.js       Harvest bag capacity, validation and crop values
src/game/farm.js            Pure soil/seed strokes, harvest bag, sales and farm economy
src/game/storage.js         Validated v1–v7 to v8 browser save migration
src/game/settings.js        Independent brightness preference
src/render/scene.js         Babylon engine, warm lighting, fixed isometric camera
src/render/cameraMovement.js Screen-relative WASD and drag panning with movement limits
src/render/world.js         Continuous terrain, one merged soil texture and free-position models
src/render/cropMeshes.js    Procedural crop models
src/render/sprinklerMeshes.js Procedural spinning sprinkler
src/render/watering.js      Reusable watering particle feedback
src/ui/interface.js         Shop tabs, tool stock counters, inspector and settings
tests/farm.test.js          Soil brush, stock-aware crops, sprinklers and migrations
tests/shop.test.js          Shop purchase rules, inventory safety and older save migration
tests/planting.test.js      World-space seed swaths, spacing, depletion and persistence
tests/harvestBag.test.js    Bag capacity, blocked harvests, mixed crop sales and save migration
tests/interface.test.js     Shop tab interactions, purchase callbacks and stock UI
tests/world.test.js         Shared soil texture and independent entity lifecycle tests
tests/cameraMovement.test.js Camera direction, drag, zoom and keyboard movement tests
tests/cropMeshes.test.js    Wheat growth/geometry tests
tests/settings.test.js      Display preference tests
.github/workflows/pages.yml GitHub Pages deploy with Node tests
```

The active v8 game uses `soil: [{x,z}]` as a continuous paint mask, `plants: [{x,z,...}]` for independently placed/growing crops, and `sprinklers: [{x,z}]` for independently placed buildings. No hidden plot or soil-stamp index determines where a crop can grow. Historical grid/patch schemas exist only in save migration.

## Deploy
In **Settings → Pages → Build and deployment**, use **GitHub Actions** as the source. Pushes to `main` trigger the workflow. The site is expected at https://jonatannorrby.github.io/farmy/. Babylon.js loads from its official CDN and needs an internet connection.
