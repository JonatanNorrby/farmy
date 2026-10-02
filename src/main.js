import { newFarm, buyShopItem, sellHarvest, plant, water, harvest, expandFarm, onLand, isPrepared,
  findPlantIndex, findSprinklerIndex, paintSoil, paintSeeds, placeSprinkler, nearbySprinkler } from "./game/farm.js";
import { FARM } from "./config/crops.js";
import { pointerGestureMode, crossedDragThreshold } from "./render/cameraMovement.js";
import { loadFarm, saveFarm, clearFarm } from "./game/storage.js";
import { loadBrightness, saveBrightness } from "./game/settings.js";
import { createScene } from "./render/scene.js";
import { createWorld } from "./render/world.js";
import { createInterface } from "./ui/interface.js";

function boot() {
  const canvas = document.querySelector("#game");
  const loading = document.querySelector("#loading");
  const { B, engine, scene, camera, resize, setBrightness, cameraMovement } = createScene(canvas);
  let brightness = loadBrightness();
  setBrightness(brightness);
  const world = createWorld(scene);
  let state = loadFarm();
  let selectedTool = "wheat";
  let hovered = null;
  let gesture = null;
  let lastTick = 0;

  function refresh(now = Date.now()) {
    world.updateLand(state.landLevel);
    world.syncSoil(state.soil);
    world.syncEntities(state.plants, state.sprinklers, now);
    ui.render(state, selectedTool, hovered, now);
  }
  const ui = createInterface({
    brightness,
    onBrightnessChange(value) {
      brightness = setBrightness(value);
      saveBrightness(brightness);
    },
    onToolChange(id) {
      endGesture(null, true);
      selectedTool = id;
      ui.render(state, selectedTool, hovered);
      if ((id === "wheat" || id === "sprinkler") && state.inventory[id] === 0) {
        ui.notify("Out of stock · Open Shop");
      }
    },
    onBuy(id) {
      accept(buyShopItem(state, id));
    },
    onSell() {
      accept(sellHarvest(state));
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
      endGesture(null, true);
      clearFarm();
      state = newFarm();
      saveFarm(state);
      refresh();
      ui.notify("Farm reset");
    },
  });
  refresh();

  function pointFromPointer() {
    // The only pickable surface is the continuous ground; never pick crops.
    const hit = scene.pick(scene.pointerX, scene.pointerY,
      mesh => mesh.metadata?.farmSurface === true, false, camera);
    return hit?.hit && hit.pickedPoint
      ? { x: hit.pickedPoint.x, z: hit.pickedPoint.z }
      : null;
  }
  function accept(result, now = Date.now(), announce = true) {
    if (result.ok) {
      state = result.state;
      saveFarm(state);
      refresh(now);
      for (const targetIndex of result.wateredIndices ?? []) {
        if (selectedTool === "water") {
          world.playWatering(targetIndex);
          continue;
        }
        const sprinklerIndex = result.sprinklerIndex ??
          nearbySprinkler(state, state.plants[targetIndex]);
        if (sprinklerIndex < 0) world.playWatering(targetIndex);
        else world.playSprinklerWatering(sprinklerIndex, targetIndex);
      }
    }
    if (announce) ui.notify(result.message);
    return result;
  }
  function interact(point) {
    const now = Date.now();
    if (!onLand(state, point)) {
      accept(expandFarm(state), now);
      return;
    }
    if (selectedTool === "plot") {
      accept(paintSoil(state, point, point), now);
      return;
    }
    const cropIndex = findPlantIndex(state, point);
    const sprinklerIndex = findSprinklerIndex(state, point);
    const crop = cropIndex >= 0 ? state.plants[cropIndex] : null;
    const sprinkler = sprinklerIndex >= 0 ? state.sprinklers[sprinklerIndex] : null;
    const sprinklerFirst = sprinkler && (!crop ||
      Math.hypot(sprinkler.x - point.x, sprinkler.z - point.z) <=
      Math.hypot(crop.x - point.x, crop.z - point.z));
    if (sprinklerFirst) {
      ui.notify("💦 Sprinkler active");
      return;
    }
    if (crop) {
      const result = now >= crop.readyAt ? harvest(state, cropIndex, now) :
        selectedTool === "water" ? water(state, cropIndex, now) :
        { ok: false, message: "Already planted · Water or harvest" };
      accept(result, now);
      return;
    }
    if (selectedTool === "water") {
      ui.notify("Select a growing crop.");
    } else if (selectedTool === "sprinkler") {
      accept(placeSprinkler(state, point, now), now);
    } else {
      accept(plant(state, point, "wheat", now), now);
    }
  }

  // A short press is still a normal farm interaction (including harvesting).
  // Wheat left-drag from prepared soil paints seeds; from bare grass it pans.
  // Plot left-drag paints soil. Right-drag always pans without spending stock.
  function endGesture(event, cancelled = false) {
    if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
    const ended = gesture;
    gesture = null;
    if (canvas.hasPointerCapture?.(ended.pointerId)) {
      canvas.releasePointerCapture(ended.pointerId);
    }
    if (!cancelled && (ended.mode === "pending" || ended.mode === "seed-pending") &&
        ended.startPoint) {
      interact(ended.startPoint);
    }
    if (!cancelled && ended.mode === "seed" && ended.plantedTotal > 0) {
      ui.notify("🌾 Painted " + ended.plantedTotal + " seed" +
        (ended.plantedTotal === 1 ? "" : "s") +
        (state.inventory.wheat === 0 ? " · Bag empty" : ""));
    }
    canvas.style.cursor = selectedTool === "plot" ? "crosshair" : "grab";
  }
  function beginGesture(event) {
    if (gesture) return;
    const point = pointFromPointer();
    const onOwnedLand = onLand(state, point, FARM.patchRadius);
    const seedable = selectedTool === "wheat" && state.inventory.wheat > 0 &&
      isPrepared(state, point);
    const mode = pointerGestureMode(event.button, selectedTool, onOwnedLand, seedable);
    if (!mode) return;
    gesture = {
      pointerId: event.pointerId, mode,
      startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      startPoint: point, lastPaintPoint: mode === "paint" ? point : null,
      lastSeedPoint: mode === "seed-pending" ? point : null, plantedTotal: 0,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Not supported by every device. */ }
    if (event.button === 2) event.preventDefault();
    if (mode === "paint") {
      const result = paintSoil(state, point, point);
      accept(result, Date.now(), result.message !== "Already prepared.");
    }
    canvas.style.cursor = gesture.mode === "pan" ? "grabbing" :
      selectedTool === "plot" || gesture.mode === "seed-pending" ? "crosshair" : "grab";
  }
  function moveGesture(event) {
    const point = pointFromPointer();
    if (gesture && gesture.pointerId === event.pointerId) {
      let dx = event.clientX - gesture.lastX;
      let dy = event.clientY - gesture.lastY;
      if ((gesture.mode === "pending" || gesture.mode === "seed-pending") &&
          crossedDragThreshold(gesture.startX, gesture.startY, event.clientX, event.clientY)) {
        if (gesture.mode === "seed-pending") {
          gesture.mode = "seed";
        } else {
          gesture.mode = "pan";
          dx = event.clientX - gesture.startX;
          dy = event.clientY - gesture.startY;
        }
      }
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      if (gesture.mode === "pan") {
        cameraMovement.drag(dx, dy);
        hovered = null;
        world.setHover(null);
        canvas.style.cursor = "grabbing";
        ui.render(state, selectedTool, hovered);
        return;
      }
      if (gesture.mode === "paint") {
        if (point && onLand(state, point, FARM.patchRadius)) {
          const result = paintSoil(state, gesture.lastPaintPoint ?? point, point);
          accept(result, Date.now(), result.ok);
          gesture.lastPaintPoint = point;
        } else {
          gesture.lastPaintPoint = null; // Never bridge a stroke through unowned land.
        }
      }
      if (gesture.mode === "seed") {
        if (point && gesture.lastSeedPoint && state.inventory.wheat > 0) {
          const result = paintSeeds(state, gesture.lastSeedPoint, point, "wheat", Date.now());
          accept(result, Date.now(), false);
          if (result.ok) gesture.plantedTotal += result.plantedIndices.length;
        }
        // Never bridge missing pointer positions when returning to the canvas.
        gesture.lastSeedPoint = point;
      }
    }
    hovered = point;
    world.setHover(point);
    const seedHover = selectedTool === "wheat" && state.inventory.wheat > 0 &&
      isPrepared(state, point);
    canvas.style.cursor = selectedTool === "plot" || seedHover ? "crosshair" : "grab";
    ui.render(state, selectedTool, hovered);
  }

  scene.onPointerObservable.add(info => {
    if (info.type === B.PointerEventTypes.POINTERDOWN) beginGesture(info.event);
    else if (info.type === B.PointerEventTypes.POINTERMOVE) moveGesture(info.event);
    else if (info.type === B.PointerEventTypes.POINTERUP) endGesture(info.event);
  });
  // Capture normally delivers POINTERUP to Babylon. These handle cancellation
  // or release outside the canvas without leaving a stuck drag/paint gesture.
  window.addEventListener("pointerup", event => endGesture(event));
  window.addEventListener("pointercancel", event => endGesture(event, true));
  canvas.addEventListener("lostpointercapture", event => endGesture(event, true));
  canvas.addEventListener("pointerleave", () => {
    hovered = null;
    world.setHover(null);
    if (gesture?.mode === "paint") gesture.lastPaintPoint = null;
    if (gesture?.mode === "seed") gesture.lastSeedPoint = null;
    ui.render(state, selectedTool, hovered);
  });

  function typingTarget(element) {
    return element instanceof HTMLElement &&
      (element.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(element.tagName));
  }
  const settingsPanel = document.querySelector("#settings-panel");
  const shopPanel = document.querySelector("#shop-panel");
  window.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || typingTarget(event.target) ||
        !settingsPanel.hidden || !shopPanel.hidden) return;
    if (cameraMovement.setKey(event.key, true)) {
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    const choices = { "1": "wheat", "2": "water", "3": "sprinkler", "4": "plot" };
    if (choices[event.key]) {
      endGesture(null, true);
      selectedTool = choices[event.key];
      ui.render(state, selectedTool, hovered);
    }
    if (event.key === "Escape") {
      endGesture(null, true);
      hovered = null;
      world.setHover(null);
      ui.render(state, selectedTool, hovered);
    }
  });
  window.addEventListener("keyup", event => cameraMovement.setKey(event.key, false));
  window.addEventListener("blur", () => {
    cameraMovement.clearKeys();
    endGesture(null, true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cameraMovement.clearKeys();
      endGesture(null, true);
    }
  });
  window.addEventListener("resize", resize);
  engine.runRenderLoop(() => {
    const now = Date.now();
    if (cameraMovement.update(engine.getDeltaTime() / 1000, !gesture && settingsPanel.hidden && shopPanel.hidden)) {
      hovered = null;
      world.setHover(null);
    }
    if (now - lastTick > 250) {
      lastTick = now;
      world.syncEntities(state.plants, state.sprinklers, now);
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
