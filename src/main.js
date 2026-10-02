import { PLOT_COUNT } from "./config/crops.js";
import { newFarm, plant, water, harvest, growthStage } from "./game/farm.js";
import { loadFarm, saveFarm, clearFarm } from "./game/storage.js";
import { createScene } from "./render/scene.js";
import { createWorld } from "./render/world.js";
import { createInterface } from "./ui/interface.js";

function boot() {
  const canvas = document.querySelector("#game");
  const loading = document.querySelector("#loading");
  const { B, engine, scene, camera, resize } = createScene(canvas);
  const world = createWorld(scene);
  let state = loadFarm();
  let selectedTool = "carrot";
  let hovered = null;
  let lastTick = 0;

  const ui = createInterface({
    onToolChange(id) {
      selectedTool = id;
      ui.render(state, selectedTool, hovered);
      ui.notify(id === "water" ? "💧 Watering can selected" : "Selected " + id + " seeds");
    },
    onReset() {
      clearFarm();
      state = newFarm();
      saveFarm(state);
      for (let i = 0; i < PLOT_COUNT; i++) world.updatePlot(i, null, -1);
      ui.render(state, selectedTool, hovered);
      ui.notify("✿ Your fresh little garden is ready!");
    },
  });

  function updatePlants(now) {
    for (let i = 0; i < PLOT_COUNT; i++) {
      const plot = state.plots[i];
      world.updatePlot(i, plot, growthStage(plot, now));
    }
  }
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
    if (plot && now >= plot.readyAt) result = harvest(state, index, now);
    else if (selectedTool === "water") result = water(state, index, now);
    else if (plot) {
      result = { ok: false, message: "Already planted! Try watering this crop or wait for harvest." };
    } else result = plant(state, index, selectedTool, now);

    if (result.ok) {
      state = result.state;
      saveFarm(state);
      updatePlants(now);
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
    const choices = { "1": "carrot", "2": "wheat", "3": "pumpkin", "4": "water" };
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
