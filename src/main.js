import { newFarm, buyShopItem, plant, water, harvest, expandFarm, onLand, findPatchIndex,
  paintSoil, placeSprinkler, isSprinkler, nearbySprinkler } from "./game/farm.js";
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

  // A short press is a farm interaction. A movement beyond the threshold
  // switches to panning BEFORE any seed, sprinkler, water or harvest is spent.
  // Plot mode paints from pointerdown; right-drag pans in every tool.
  function endGesture(event, cancelled = false) {
    if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
    const ended = gesture;
    gesture = null;
    if (canvas.hasPointerCapture?.(ended.pointerId)) {
      canvas.releasePointerCapture(ended.pointerId);
    }
    if (!cancelled && ended.mode === "pending" && ended.startPoint) {
      interact(ended.startPoint);
    }
    canvas.style.cursor = selectedTool === "plot" ? "crosshair" : "grab";
  }
  function beginGesture(event) {
    if (gesture) return;
    const point = pointFromPointer();
    const mode = pointerGestureMode(event.button, selectedTool,
      onLand(state, point, FARM.patchRadius));
    if (!mode) return;
    gesture = {
      pointerId: event.pointerId, mode,
      startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      startPoint: point, lastPaintPoint: mode === "paint" ? point : null,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Not supported by every device. */ }
    if (event.button === 2) event.preventDefault();
    if (mode === "paint") {
      const result = paintSoil(state, point, point);
      accept(result, Date.now(), result.message !== "Already prepared.");
    }
    canvas.style.cursor = gesture.mode === "pan" ? "grabbing" :
      selectedTool === "plot" ? "crosshair" : "grab";
  }
  function moveGesture(event) {
    const point = pointFromPointer();
    if (gesture && gesture.pointerId === event.pointerId) {
      let dx = event.clientX - gesture.lastX;
      let dy = event.clientY - gesture.lastY;
      if (gesture.mode === "pending" &&
          crossedDragThreshold(gesture.startX, gesture.startY, event.clientX, event.clientY)) {
        gesture.mode = "pan";
        dx = event.clientX - gesture.startX;
        dy = event.clientY - gesture.startY;
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
    }
    hovered = point;
    world.setHover(point);
    canvas.style.cursor = selectedTool === "plot" ? "crosshair" : "grab";
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
