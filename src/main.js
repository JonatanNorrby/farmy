import { newFarm, plant, water, harvest, expandFarm, onLand, findPatchIndex,
  paintSoil, placeSprinkler, isSprinkler, nearbySprinkler } from "./game/farm.js";
import { FARM } from "./config/crops.js";
import { loadFarm, saveFarm, clearFarm } from "./game/storage.js";
import { loadBrightness, saveBrightness } from "./game/settings.js";
import { createScene } from "./render/scene.js";
import { createWorld } from "./render/world.js";
import { createInterface } from "./ui/interface.js";

function boot() {
  const canvas = document.querySelector("#game");
  const loading = document.querySelector("#loading");
  const { B, engine, scene, camera, resize, setBrightness } = createScene(canvas);
  let brightness = loadBrightness();
  setBrightness(brightness);
  const world = createWorld(scene);
  let state = loadFarm();
  let selectedTool = "wheat";
  let hovered = null;
  let painting = false;
  let lastPaintPoint = null;
  let lastTick = 0;

  function refresh(now = Date.now()) {
    world.updateLand(state.landLevel);
    world.syncPatches(state.patches, now);
    ui.render(state, selectedTool, hovered, now);
  }
  const ui = createInterface({
    brightness,
    onBrightnessChange(value) {
      brightness = setBrightness(value);
      saveBrightness(brightness);
    },
    onToolChange(id) {
      painting = false;
      selectedTool = id;
      ui.render(state, selectedTool, hovered);
    },
    onExpand() {
      const result = expandFarm(state);
      if (result.ok) {
        state = result.state;
        saveFarm(state);
        refresh();
      }
      ui.render(state, selectedTool, hovered);
      ui.notify(result.message);
    },
    onReset() {
      painting = false;
      lastPaintPoint = null;
      clearFarm();
      state = newFarm();
      saveFarm(state);
      refresh();
      ui.notify("Farm reset");
    },
  });
  refresh();

  function pointFromPointer() {
    // Pick ONLY the ground, not overlapping wheat, soil marks or sprinklers.
    // Babylon gives us a continuous world-space intersection instead of a tile ID.
    const hit = scene.pick(scene.pointerX, scene.pointerY,
      mesh => mesh.metadata?.farmSurface === true, false, camera);
    return hit?.hit && hit.pickedPoint
      ? { x: hit.pickedPoint.x, z: hit.pickedPoint.z }
      : null;
  }
  function accept(result, now = Date.now(), announce = true, sourceIndex = -1) {
    if (result.ok) {
      state = result.state;
      saveFarm(state);
      refresh(now);
      for (const targetIndex of result.wateredIndices ?? []) {
        if (selectedTool === "water") {
          world.playWatering(targetIndex);
          continue;
        }
        const sprinklerIndex = sourceIndex >= 0 && isSprinkler(state.patches[sourceIndex]?.content)
          ? sourceIndex : nearbySprinkler(state, targetIndex);
        if (sprinklerIndex < 0) world.playWatering(targetIndex);
        else world.playSprinklerWatering(sprinklerIndex, targetIndex);
      }
    }
    if (announce) ui.notify(result.message);
    return result;
  }
  function interact(point) {
    const now = Date.now();
    if (!onLand(state, point, FARM.patchRadius)) {
      accept(expandFarm(state), now);
      return;
    }
    if (selectedTool === "plot") {
      accept(paintSoil(state, point, point), now);
      return;
    }
    const index = findPatchIndex(state, point);
    if (index === -1) {
      ui.notify("Paint soil first · Plot (4)");
      return;
    }
    const content = state.patches[index].content;
    let result;
    if (isSprinkler(content)) result = { ok: false, message: "💦 Sprinkler active" };
    else if (content && now >= content.readyAt) result = harvest(state, index, now);
    else if (selectedTool === "water") result = water(state, index, now);
    else if (content) result = { ok: false, message: "Already planted · Water or harvest" };
    else if (selectedTool === "sprinkler") result = placeSprinkler(state, index, now);
    else result = plant(state, index, selectedTool, now);
    accept(result, now, true, index);
  }
  scene.onPointerObservable.add(info => {
    if (info.type === B.PointerEventTypes.POINTERUP) {
      painting = false;
      lastPaintPoint = null;
    }
    if (info.type === B.PointerEventTypes.POINTERMOVE) {
      const point = pointFromPointer();
      hovered = point;
      world.setHover(point);
      canvas.style.cursor = point ? "crosshair" : "default";
      if (painting && selectedTool === "plot" && point) {
        const result = paintSoil(state, lastPaintPoint ?? point, point);
        accept(result, Date.now(), false);
        lastPaintPoint = point;
      }
      ui.render(state, selectedTool, hovered);
    }
    if (info.type === B.PointerEventTypes.POINTERDOWN && info.event.button === 0) {
      const point = pointFromPointer();
      hovered = point;
      world.setHover(point);
      if (!point) return;
      interact(point);
      // Clicking unowned land can buy expansion, but dragging cannot purchase
      // additional expansions accidentally.
      painting = selectedTool === "plot" && onLand(state, point, FARM.patchRadius);
      lastPaintPoint = painting ? point : null;
    }
  });
  window.addEventListener("pointerup", () => { painting = false; lastPaintPoint = null; });
  canvas.addEventListener("pointerleave", () => {
    hovered = null;
    world.setHover(null);
    canvas.style.cursor = "default";
    ui.render(state, selectedTool, hovered);
  });
  window.addEventListener("keydown", event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const choices = { "1": "wheat", "2": "water", "3": "sprinkler", "4": "plot" };
    if (choices[event.key]) {
      painting = false;
      selectedTool = choices[event.key];
      ui.render(state, selectedTool, hovered);
    }
    if (event.key === "Escape") {
      painting = false;
      hovered = null;
      world.setHover(null);
      ui.render(state, selectedTool, hovered);
    }
  });
  window.addEventListener("resize", resize);
  engine.runRenderLoop(() => {
    const now = Date.now();
    if (now - lastTick > 250) {
      lastTick = now;
      world.syncPatches(state.patches, now);
      ui.render(state, selectedTool, hovered, now);
    }
    world.animate(performance.now());
    scene.render();
  });
  loading.classList.add("hidden");
  loading.addEventListener("transitionend", () => loading.remove(), { once: true });
}

try {
  boot();
} catch (error) {
  console.error("Farmy could not start:", error);
  document.querySelector("#loading-detail").textContent = error.message || "Please refresh to try again.";
  document.querySelector("#loading .loading-flower").textContent = "☁";
}
