import { PLOT_COUNT } from "./config/crops.js";
import { newFarm, plant, water, harvest, growthStage, expandFarm, isPlotUnlocked, placeSprinkler, isSprinkler, neighboringPlots } from "./game/farm.js";
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
  let lastTick = 0;

  const ui = createInterface({
    brightness,
    onBrightnessChange(value) {
      brightness = setBrightness(value);
      saveBrightness(brightness);
    },
    onToolChange(id) {
      selectedTool = id;
      ui.render(state, selectedTool, hovered);
    },
    onExpand() {
      const result = expandFarm(state);
      if (result.ok) {
        state = result.state;
        saveFarm(state);
        world.updateExpansion(state.unlockedRows);
      }
      ui.render(state, selectedTool, hovered);
      ui.notify(result.message);
    },
    onReset() {
      clearFarm();
      state = newFarm();
      saveFarm(state);
      world.updateExpansion(state.unlockedRows);
      for (let i = 0; i < PLOT_COUNT; i++) world.updatePlot(i, null, -1);
      ui.render(state, selectedTool, hovered);
      ui.notify("Farm reset");
    },
  });

  function updatePlants(now) {
    for (let i = 0; i < PLOT_COUNT; i++) {
      const plot = state.plots[i];
      world.updatePlot(i, plot, growthStage(plot, now));
    }
  }
  world.updateExpansion(state.unlockedRows);
  updatePlants(Date.now());
  ui.render(state, selectedTool, hovered);

  function plotFromPointer() {
    // All decorations/crops are non-pickable, allowing a clear click on the soil.
    const hit = scene.pick(scene.pointerX, scene.pointerY,
      mesh => Number.isInteger(mesh.metadata?.plotIndex), false, camera);
    return hit?.hit && hit.pickedMesh ? hit.pickedMesh.metadata.plotIndex : null;
  }

  function interact(index) {
    const now = Date.now();
    const plot = state.plots[index];
    let result;
    if (!isPlotUnlocked(state, index)) result = expandFarm(state);
    else if (isSprinkler(plot)) result = { ok: false, message: "💦 Sprinkler active · waters adjacent plots" };
    else if (plot && now >= plot.readyAt) result = harvest(state, index, now);
    else if (selectedTool === "water") result = water(state, index, now);
    else if (plot) {
      result = { ok: false, message: "Already planted · Water or harvest" };
    } else if (selectedTool === "sprinkler") result = placeSprinkler(state, index, now);
    else result = plant(state, index, selectedTool, now);

    if (result.ok) {
      state = result.state;
      saveFarm(state);
      world.updateExpansion(state.unlockedRows);
      updatePlants(now);
      // Farming results identify crops that have JUST become watered. Particle
      // effects are visual only and never re-apply the simulation bonus.
      for (const targetIndex of result.wateredIndices ?? []) {
        if (selectedTool === "water") {
          world.playWatering(targetIndex);
          continue;
        }
        const sprinklerIndex = isSprinkler(state.plots[index]) ? index :
          neighboringPlots(targetIndex).find(other => isPlotUnlocked(state, other) && isSprinkler(state.plots[other]));
        if (sprinklerIndex === undefined) world.playWatering(targetIndex);
        else world.playSprinklerWatering(sprinklerIndex, targetIndex);
      }
    }
    ui.render(state, selectedTool, hovered, now);
    ui.notify(result.message);
  }

  scene.onPointerObservable.add(info => {
    if (info.type === B.PointerEventTypes.POINTERMOVE) {
      const next = plotFromPointer();
      if (hovered !== next) {
        hovered = next;
        world.setHover(hovered);
        canvas.style.cursor = hovered === null ? "default" : "pointer";
        ui.render(state, selectedTool, hovered);
      }
    }
    if (info.type === B.PointerEventTypes.POINTERDOWN && info.event.button === 0) {
      hovered = plotFromPointer();
      world.setHover(hovered);
      if (hovered !== null) interact(hovered);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    hovered = null; world.setHover(null);
    canvas.style.cursor = "default";
    ui.render(state, selectedTool, hovered);
  });

  window.addEventListener("keydown", event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const choices = { "1": "wheat", "2": "water", "3": "sprinkler" };
    if (choices[event.key]) {
      selectedTool = choices[event.key];
      ui.render(state, selectedTool, hovered);
    }
    if (event.key === "Escape") {
      hovered = null; world.setHover(null); ui.render(state, selectedTool, hovered);
    }
  });
  window.addEventListener("resize", resize);
  engine.runRenderLoop(() => {
    const now = Date.now();
    if (now - lastTick > 250) {
      lastTick = now;
      updatePlants(now);
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
