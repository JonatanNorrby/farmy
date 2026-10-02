import { FARM, landBounds } from "../config/crops.js";
import { growthStage } from "../game/farm.js";
import { buildCrop, createCropMaterials } from "./cropMeshes.js";
import { createWateringEffect } from "./watering.js";
import { buildSprinkler, createSprinklerMaterials } from "./sprinklerMeshes.js";

// Continuous ground + circular, overlapping brush marks; no selectable cells.
export function createWorld(scene) {
  const B = globalThis.BABYLON;
  const palette = {
    base: "#68865f", field: "#7e9c68", soil: "#665039",
    furrow: "#59442f", marker: "#e9d2a5",
  };
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

  function box(name, width, height, depth, x, y, z, material, parent) {
    const mesh = B.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    return mesh;
  }
  const full = landBounds(FARM.maxLevel);
  const width = full.maxX - full.minX;
  const depth = full.maxZ - full.minZ;
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
    const ownedDepth = bounds.maxZ - bounds.minZ;
    owned.position.z = (bounds.maxZ + bounds.minZ) / 2;
    owned.scaling.z = ownedDepth / depth;
    renderedLevel = level;
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
  const views = [];
  function createSoil(patch, index) {
    const circle = B.MeshBuilder.CreateCylinder("painted soil " + index, {
      diameter: FARM.patchRadius * 2, height: .075, tessellation: 12,
    }, scene);
    circle.position.set(patch.x, .13, patch.z);
    circle.material = materials.soil;
    circle.isPickable = false;
    const furrows = [];
    for (const offset of [-.21, 0, .21]) {
      furrows.push(box("soft soil furrow", .78, .012, .07,
        patch.x, .177, patch.z + offset, materials.furrow));
    }
    return { x: patch.x, z: patch.z, circle, furrows, root: null,
      sprinklerHead: null, stage: -99, displayId: null };
  }
  function clearRoot(view) {
    if (view.root) view.root.dispose();
    view.root = null;
    view.sprinklerHead = null;
  }
  function updatePatch(index, patch, now) {
    const view = views[index];
    const content = patch.content;
    const stage = growthStage(content, now);
    const displayId = content?.kind === "sprinkler" ? "sprinkler" : content?.cropId ?? null;
    if (view.stage === stage && view.displayId === displayId) return;
    clearRoot(view);
    view.stage = stage;
    view.displayId = displayId;
    if (!content) return;
    const root = new B.TransformNode("farm crop " + index, scene);
    root.position.set(patch.x, .18, patch.z);
    if (displayId === "sprinkler") {
      view.sprinklerHead = buildSprinkler(scene, root, sprinklerMaterials);
    } else {
      buildCrop(scene, root, content.cropId, stage, cropMaterials);
    }
    view.root = root;
  }
  function syncPatches(patches, now = Date.now()) {
    while (views.length > patches.length) {
      const view = views.pop();
      clearRoot(view);
      view.circle.dispose();
      for (const mesh of view.furrows) mesh.dispose();
    }
    for (let index = 0; index < patches.length; index++) {
      const patch = patches[index];
      if (!views[index]) views.push(createSoil(patch, index));
      updatePatch(index, patch, now);
    }
  }
  function playWatering(index) {
    if (views[index]) wateringEffect.play(views[index]);
  }
  function playSprinklerWatering(sourceIndex, targetIndex) {
    if (views[sourceIndex] && views[targetIndex]) wateringEffect.spray(views[sourceIndex], views[targetIndex]);
  }
  function animate(ms) {
    for (let index = 0; index < views.length; index++) {
      const view = views[index];
      if (view.sprinklerHead) view.sprinklerHead.rotation.y = ms * .0011 + index * .23;
      else if (view.root) view.root.rotation.z = Math.sin(ms * .00125 + index * .7) * .024;
    }
  }
  return { ground, views, updateLand, syncPatches, setHover,
    playWatering, playSprinklerWatering, animate };
}
