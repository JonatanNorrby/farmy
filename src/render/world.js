import { FARM, landBounds } from "../config/crops.js";
import { growthStage } from "../game/farm.js";
import { buildCrop, createCropMaterials } from "./cropMeshes.js";
import { createWateringEffect } from "./watering.js";
import { buildSprinkler, createSprinklerMaterials } from "./sprinklerMeshes.js";

// Ground uses a single dynamic soil texture; plants and sprinklers are free
// world-space entities, not children of soil dabs or hidden selectable tiles.
export function createWorld(scene) {
  const B = globalThis.BABYLON;
  const palette = { base: "#68865f", field: "#7e9c68", marker: "#e9d2a5" };
  const materials = Object.fromEntries(Object.entries(palette).map(([name, hex]) => {
    const material = new B.StandardMaterial("farm-" + name, scene);
    material.diffuseColor = B.Color3.FromHexString(hex);
    material.specularColor = new B.Color3(.035, .035, .025);
    return [name, material];
  }));
  materials.marker.alpha = .45;
  materials.marker.backFaceCulling = false;
  const cropMaterials = createCropMaterials(scene);
  const sprinklerMaterials = createSprinklerMaterials(scene);
  const wateringEffect = createWateringEffect(scene);
  function box(name, width, height, depth, x, y, z, material) {
    const mesh = B.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  const full = landBounds(FARM.maxLevel);
  const width = full.maxX - full.minX, depth = full.maxZ - full.minZ;
  const centerX = (full.minX + full.maxX) / 2;
  const centerZ = (full.minZ + full.maxZ) / 2;
  const ground = box("continuous farm ground", width, .20, depth,
    centerX, -.06, centerZ, materials.base);
  ground.isPickable = true;
  ground.metadata = { farmSurface: true };
  const owned = box("owned farm surface", width, .028, depth,
    centerX, .058, centerZ, materials.field);
  let renderedLevel = null;
  function updateLand(level) {
    if (renderedLevel === level) return;
    const bounds = landBounds(level);
    owned.position.z = (bounds.maxZ + bounds.minZ) / 2;
    owned.scaling.z = (bounds.maxZ - bounds.minZ) / depth;
    renderedLevel = level;
  }

  // A transparent canvas is the painted soil mask. Overlapping brush dabs
  // actually merge into one surface instead of becoming discrete "plot" meshes.
  const textureSize = 1024;
  const soilTexture = new B.DynamicTexture("painted soil canvas",
    { width: textureSize, height: textureSize }, scene, false);
  soilTexture.hasAlpha = true;
  const soilContext = soilTexture.getContext();
  const soilMaterial = new B.StandardMaterial("painted soil surface", scene);
  soilMaterial.diffuseTexture = soilTexture;
  soilMaterial.useAlphaFromDiffuseTexture = true;
  soilMaterial.backFaceCulling = false;
  soilMaterial.specularColor = new B.Color3(.02, .02, .015);
  const soilSurface = B.MeshBuilder.CreateGround("continuous painted soil",
    { width, height: depth, subdivisions: 1 }, scene);
  soilSurface.position.set(centerX, .078, centerZ);
  soilSurface.material = soilMaterial;
  soilSurface.isPickable = false;
  const drawnSoil = [];
  function drawDab(mark) {
    const u = (mark.x - full.minX) / width * textureSize;
    // Ground UV v points from -Z toward +Z. DynamicTexture.update(false)
    // preserves the canvas orientation for this mapping.
    const v = (mark.z - full.minZ) / depth * textureSize;
    soilContext.save();
    soilContext.translate(u, v);
    soilContext.scale(textureSize / width, textureSize / depth);
    soilContext.fillStyle = "#665039";
    soilContext.beginPath();
    soilContext.arc(0, 0, FARM.patchRadius, 0, Math.PI * 2);
    soilContext.fill();
    soilContext.strokeStyle = "#59442f";
    soilContext.lineWidth = .055;
    for (const offset of [-.20, 0, .20]) {
      const extent = Math.sqrt(FARM.patchRadius ** 2 - offset ** 2) * .75;
      soilContext.beginPath();
      soilContext.moveTo(-extent, offset);
      soilContext.lineTo(extent, offset);
      soilContext.stroke();
    }
    soilContext.restore();
  }
  function syncSoil(soil) {
    const prefixMatches = soil.length >= drawnSoil.length &&
      drawnSoil.every((mark, i) => mark.x === soil[i].x && mark.z === soil[i].z);
    if (!prefixMatches) {
      soilContext.clearRect(0, 0, textureSize, textureSize);
      drawnSoil.length = 0;
    }
    const previous = drawnSoil.length;
    for (let i = previous; i < soil.length; i++) {
      const mark = soil[i];
      drawDab(mark);
      drawnSoil.push({ x: mark.x, z: mark.z });
    }
    if (!prefixMatches || previous !== drawnSoil.length) soilTexture.update(false);
  }

  const marker = B.MeshBuilder.CreateCylinder("round soil brush", {
    diameter: FARM.patchRadius * 2, height: .01, tessellation: 20,
  }, scene);
  marker.material = materials.marker;
  marker.isPickable = false;
  marker.setEnabled(false);
  function setHover(point) {
    if (!point) { marker.setEnabled(false); return; }
    marker.position.set(point.x, .185, point.z);
    marker.setEnabled(true);
  }

  const plantViews = [], sprinklerViews = [];
  function disposeView(view) { if (view?.root) view.root.dispose(); }
  function createPlantView(plant, index, stage) {
    const root = new B.TransformNode("painted crop " + index, scene);
    root.position.set(plant.x, .16, plant.z);
    buildCrop(scene, root, plant.cropId, stage, cropMaterials);
    return { x: plant.x, z: plant.z, cropId: plant.cropId, stage, root };
  }
  function createSprinklerView(item, index) {
    const root = new B.TransformNode("placed sprinkler " + index, scene);
    root.position.set(item.x, .16, item.z);
    const head = buildSprinkler(scene, root, sprinklerMaterials);
    return { x: item.x, z: item.z, root, head };
  }
  function syncEntities(plants, sprinklers, now = Date.now()) {
    while (plantViews.length > plants.length) disposeView(plantViews.pop());
    for (let index = 0; index < plants.length; index++) {
      const plant = plants[index], stage = growthStage(plant, now);
      const view = plantViews[index];
      if (view && view.x === plant.x && view.z === plant.z &&
          view.cropId === plant.cropId && view.stage === stage) continue;
      disposeView(view);
      plantViews[index] = createPlantView(plant, index, stage);
    }
    while (sprinklerViews.length > sprinklers.length) disposeView(sprinklerViews.pop());
    for (let index = 0; index < sprinklers.length; index++) {
      const item = sprinklers[index], view = sprinklerViews[index];
      if (view && view.x === item.x && view.z === item.z) continue;
      disposeView(view);
      sprinklerViews[index] = createSprinklerView(item, index);
    }
  }
  function playWatering(index) {
    if (plantViews[index]) wateringEffect.play(plantViews[index]);
  }
  function playSprinklerWatering(sourceIndex, targetIndex) {
    if (sprinklerViews[sourceIndex] && plantViews[targetIndex])
      wateringEffect.spray(sprinklerViews[sourceIndex], plantViews[targetIndex]);
  }
  function animate(ms) {
    for (let index = 0; index < sprinklerViews.length; index++) {
      sprinklerViews[index].head.rotation.y = ms * .0011 + index * .23;
    }
    for (let index = 0; index < plantViews.length; index++) {
      plantViews[index].root.rotation.z = Math.sin(ms * .00125 + index * .7) * .024;
    }
  }
  return { ground, soilSurface, drawnSoil, plantViews, sprinklerViews,
    updateLand, syncSoil, syncEntities, setHover, playWatering,
    playSprinklerWatering, animate };
}
