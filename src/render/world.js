import { FARM, plotPosition, PLOT_COUNT } from "../config/crops.js";
import { buildCrop, createCropMaterials } from "./cropMeshes.js";
import { createWateringEffect } from "./watering.js";
import { buildSprinkler, createSprinklerMaterials } from "./sprinklerMeshes.js";

export function createWorld(scene) {
  const B = globalThis.BABYLON;
  const materials = {};
  // Only farm materials remain. Crop and sprinkler palettes live in their
  // own render modules and do not need unrelated world scenery.
  const colors = {
    base: "#68865f", field: "#7e9c68", plotEdge: "#ab895e",
    soil: "#6c533d", furrow: "#59442f", ownedGrass: "#77946a",
    lockedGrass: "#66875d", cream: "#e9d2a5",
  };
  for (const [key, hex] of Object.entries(colors)) {
    const m = new B.StandardMaterial(key, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = new B.Color3(.035,.035,.025);
    materials[key] = m;
  }
  const cropMaterials = createCropMaterials(scene);
  const sprinklerMaterials = createSprinklerMaterials(scene);
  const wateringEffect = createWateringEffect(scene);

  function box(name, w, h, d, x, y, z, material, parent) {
    const mesh = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x,y,z); mesh.material = material; mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    return mesh;
  }
  // A plain foundation under the potential farmland, with no scenery beyond
  // its bounds. The owned portion is shown by the lawn expanding over it.
  const farmCenterX = FARM.firstX + (FARM.columns - 1) * FARM.spacing / 2;
  const farmWidth = FARM.columns * FARM.spacing + 1.45;
  const farmDepth = FARM.rows * FARM.spacing + 1.4;
  const baseCenterZ = FARM.firstZ + (FARM.rows - 1) * FARM.spacing / 2;
  box("farm foundation", farmWidth, .24, farmDepth,
    farmCenterX, -.04, baseCenterZ, materials.base);
  const farmLawn = box("owned farm lawn", farmWidth, .035, farmDepth,
    farmCenterX, .111, baseCenterZ, materials.field);

  // All twenty potential cells are pickable. Land ownership and preparation
  // are separate: owned grass turns into tilled soil only where the player builds a plot.
  const plots = [];
  for (let i = 0; i < PLOT_COUNT; i++) {
    const p = plotPosition(i);
    const edge = box("plot timber edge " + i, 2.03, .15, 2.03, p.x, .20, p.z, materials.plotEdge);
    const soil = box("clickable garden patch " + i, 1.86, .09, 1.86, p.x, .292, p.z, materials.soil);
    soil.isPickable = true;
    soil.metadata = { plotIndex: i };
    const furrows = [-.49, 0, .49].map(dz =>
      box("soft tilled soil", 1.50, .04, .13, p.x, .354, p.z + dz, materials.furrow));
    plots.push({ soil, edge, furrows, unlocked: null, prepared: null, root: null,
      sprinklerHead: null, stage: -99, cropId: null, position: p });
  }
  function updateExpansion(unlockedRows, tilled) {
    // Only the underlying farm lawn expands. New land starts as grass and
    // individual plot placement reveals soil, timber borders and furrows.
    farmLawn.position.z = FARM.firstZ + (unlockedRows - 1) * FARM.spacing / 2;
    const lawnDepth = unlockedRows * FARM.spacing + 1.4;
    farmLawn.scaling.z = lawnDepth / farmDepth;
    const count = unlockedRows * FARM.columns;
    for (let i = 0; i < plots.length; i++) {
      const view = plots[i], unlocked = i < count, prepared = unlocked && tilled[i] === true;
      if (view.unlocked === unlocked && view.prepared === prepared) continue;
      view.unlocked = unlocked;
      view.prepared = prepared;
      view.soil.material = !unlocked ? materials.lockedGrass : prepared ? materials.soil : materials.ownedGrass;
      view.edge.setEnabled(prepared);
      view.furrows.forEach(mesh => mesh.setEnabled(prepared));
    }
  }

  const marker = new B.TransformNode("hover outline",scene);
  for (const [x,z,w,d] of [[0,-1.035,2.07,.055],[0,1.035,2.07,.055],[-1.035,0,.055,2.07],[1.035,0,.055,2.07]]) {
    box("plot highlight", w,.045,d,x,.39,z,materials.cream,marker);
  }
  marker.setEnabled(false);
  function setHover(index) {
    if (index === null || index < 0 || index >= plots.length) { marker.setEnabled(false); return; }
    const pos = plots[index].position;
    marker.position.set(pos.x, 0, pos.z);
    marker.setEnabled(true);
  }
  function updatePlot(index, plot, stage) {
    const view = plots[index];
    // Structures have their own cache key: the sprinkler cannot be mistaken
    // for an empty plot (both otherwise have a growth stage of -1).
    const displayId = plot?.kind === "sprinkler" ? "sprinkler" : plot?.cropId ?? null;
    if (view.stage === stage && view.cropId === displayId) return;
    if (view.root) view.root.dispose();
    view.root = null;
    view.sprinklerHead = null;
    view.stage = stage;
    view.cropId = displayId;
    if (!plot) return;
    const root = new B.TransformNode("plot object " + index, scene);
    root.position.set(view.position.x, .37, view.position.z);
    if (displayId === "sprinkler") {
      view.sprinklerHead = buildSprinkler(scene, root, sprinklerMaterials);
    } else {
      buildCrop(scene, root, plot.cropId, stage, cropMaterials);
    }
    view.root = root;
  }

  function playWatering(index) {
    const plot = plots[index];
    if (plot) wateringEffect.play(plot.position);
  }
  function playSprinklerWatering(sourceIndex, targetIndex) {
    const source = plots[sourceIndex], target = plots[targetIndex];
    if (source && target) wateringEffect.spray(source.position, target.position);
  }

  function animate(ms) {
    for (let i=0;i<plots.length;i++) {
      const view = plots[i];
      if (view.sprinklerHead) view.sprinklerHead.rotation.y = ms * .0011 + i * .23;
      else if (view.root) view.root.rotation.z = Math.sin(ms*.00125 + i*.7) * .024;
    }
  }
  return { plots, setHover, updatePlot, updateExpansion, playWatering, playSprinklerWatering, animate };
}
