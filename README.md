# Farmy 🌱

A cozy, isometric 3D farming prototype in Babylon.js and vanilla HTML/CSS/JS, deployed to GitHub Pages.

## Play
- **Paint soil:** Choose **Plot (4)** and click-drag across owned grass. It lays overlapping round patches along your brush stroke for **3 coins per new mark**. Painting over existing soil is free; the farm no longer has a visible or interactive tile grid.
- **Plant:** Choose **Wheat (1)** and click prepared soil to plant. Each plant costs **6 coins**. Older saved carrots and pumpkins can still finish growing and be harvested, but cannot be replanted.
- **Water:** Choose **Water (2)** and click a growing plant for a one-time growth boost.
- **Sprinkler:** Choose **Sprinkler (3)** and click empty soil to place one for **36 coins**. It automatically waters growing and newly planted crops within its world-space range (including diagonals), without stacking bonuses.
- Click mature wheat to harvest it. Brush-painting applies only to soil preparation; sowing and harvesting still use clicks.
- Expand the owned land via **Expand land** for **85**, then **180** coins. New land is continuous grass ready for freeform soil painting.
- The new farm begins with four small prepared soil marks. Older v1–v4 farms are migrated to positioned patches with their existing crops, sprinklers, prepared spots, coins and land preserved.
- Progress automatically saves in the current browser; crops also grow while the page is closed.
- **Camera:** Hold **WASD** to pan relative to the isometric view. With Wheat, Water or Sprinkler selected, **left-drag anywhere on the canvas** to pan; a short click still performs the farm action. **Right-drag** pans with every tool, including Plot, without painting. In Plot mode, **left-drag continues painting soil**. Mouse wheel zooms, and panning respects the farm bounds.
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
src/game/farm.js            Pure freeform painting, farming, sprinklers and land economy
src/game/storage.js         Validated v1–v4 to v5 browser save migration
src/game/settings.js        Independent brightness preference
src/render/scene.js         Babylon engine, warm lighting, fixed isometric camera
src/render/cameraMovement.js Screen-relative WASD and drag panning with movement limits
src/render/world.js         Continuous terrain and overlapping painted soil marks
src/render/cropMeshes.js    Procedural crop models
src/render/sprinklerMeshes.js Procedural spinning sprinkler
src/render/watering.js      Reusable watering particle feedback
src/ui/interface.js         Tool selection, inspector and settings
tests/farm.test.js          Soil brush, economy, spatial sprinklers and migrations
tests/world.test.js         Ground composition and painted soil render tests
tests/cameraMovement.test.js Camera direction, drag, zoom and keyboard movement tests
tests/cropMeshes.test.js    Wheat growth/geometry tests
tests/settings.test.js      Display preference tests
.github/workflows/pages.yml GitHub Pages deploy with Node tests
```

The active game stores positions, not tile indices. The old 5×4 grid remains only in save migration, so historic farms can load without losing progress.

## Deploy
In **Settings → Pages → Build and deployment**, use **GitHub Actions** as the source. Pushes to `main` trigger the workflow. The site is expected at https://jonatannorrby.github.io/farmy/. Babylon.js loads from its official CDN and needs an internet connection.
