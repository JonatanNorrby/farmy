import { FARM, plotPosition, PLOT_COUNT } from "../config/crops.js";
import { buildCrop, createCropMaterials } from "./cropMeshes.js";
import { createWateringEffect } from "./watering.js";
import { buildSprinkler, createSprinklerMaterials } from "./sprinklerMeshes.js";

export function createWorld(scene) {
  const B = globalThis.BABYLON;
  const materials = {};
  const colors = {
    grass: "#819f6d", edge: "#66875c", earthSide: "#846347", earthBottom: "#574638",
    field: "#7e9c68", plotEdge: "#ab895e", soil: "#6c533d", furrow: "#59442f", ownedGrass: "#77946a", lockedGrass: "#66875d",
    cream: "#e9d2a5", roof: "#ad6550", roofLight: "#bb7254", wood: "#84583e",
    woodLight: "#af8254", door: "#664633", window: "#94c4b9",
    treeTrunk: "#82613f", tree: "#567e53", treeBright: "#71975c", treeDark: "#456d47",
    waterRim: "#bfb38a", water: "#659f98", waterLight: "#90c4ac",
    rock: "#acb08d", flower: "#edddc1", flowerPink: "#d98f87", flowerYellow: "#dfb55e",
    bush: "#648d58", chimney: "#8b705a",
  };
  for (const [key, hex] of Object.entries(colors)) {
    const m = new B.StandardMaterial(key, scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = new B.Color3(.035,.035,.025);
    materials[key] = m;
  }
  materials.water.alpha = .91;
  materials.window.emissiveColor = new B.Color3(.08,.1,.075);
  const cropMaterials = createCropMaterials(scene);
  const sprinklerMaterials = createSprinklerMaterials(scene);
  const wateringEffect = createWateringEffect(scene);

  function box(name, w, h, d, x, y, z, material, parent) {
    const mesh = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x,y,z); mesh.material = material; mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    return mesh;
  }
  function sphere(name, x,y,z, w,h,d, material, segments = 10) {
    const mesh = B.MeshBuilder.CreateSphere(name, { diameter: 1, segments }, scene);
    mesh.position.set(x,y,z); mesh.scaling.set(w,h,d); mesh.material = material; mesh.isPickable = false;
    return mesh;
  }
  function cylinder(name, x,y,z, h, top, bottom, material, tessellation = 8) {
    const mesh = B.MeshBuilder.CreateCylinder(name, { height: h, diameterTop: top, diameterBottom: bottom, tessellation }, scene);
    mesh.position.set(x,y,z); mesh.material = material; mesh.isPickable = false;
    return mesh;
  }

  // Layered, gently floating square of countryside.
  box("earth lower layer", 25.5, .35, 19.8, 0, -1.45, 0, materials.earthBottom);
  box("earth island", 25.8, 1.3, 19.9, 0, -.73, 0, materials.earthSide);
  box("lush grassy surface", 25.85, .18, 19.95, 0, 0, 0, materials.grass);
  const farmLawn = box("expandable farm lawn", 12.45, .035, 10.2, -4.24, .111, -.22, materials.field);

  // All twenty potential cells are pickable. Land ownership and preparation
  // are separate: owned grass turns into tilled soil only where the player builds a plot.
  const plots = [];
  const westFenceSegments = [];
  for (let i = 0; i < PLOT_COUNT; i++) {
    const p = plotPosition(i);
    const edge = box("plot timber edge " + i, 2.03, .15, 2.03, p.x, .20, p.z, materials.plotEdge);
    const soil = box("clickable garden patch " + i, 1.86, .09, 1.86, p.x, .292, p.z, materials.soil);
    soil.isPickable = true;
    soil.metadata = { plotIndex: i };
    const furrows = [-.49, 0, .49].map(dz =>
      box("soft tilled soil", 1.50, .04, .13, p.x, .354, p.z + dz, materials.furrow));
    const lockDecor = new B.TransformNode("uncleared meadow " + i, scene);
    lockDecor.position.set(p.x, 0, p.z);
    // Small wooden marker and wild grass make the next available land readable.
    box("meadow stake", .11, .53, .12, -.48, .60, -.32, materials.woodLight, lockDecor);
    box("meadow stake cap", .34, .10, .12, -.48, .86, -.32, materials.cream, lockDecor);
    const tufts = [[.35,.25],[-.20,.36],[.35,-.40]];
    for (const [tx,tz] of tufts) {
      const tuft = sphere("uncleared grass", p.x + tx, .44, p.z + tz, .24, .24, .18, materials.treeDark, 6);
      tuft.parent = lockDecor;
      // Absolute mesh positions become local when parented; correct to the tile.
      tuft.position.set(tx, .44, tz);
    }
    plots.push({ soil, edge, furrows, lockDecor, unlocked: null, prepared: null, root: null, sprinklerHead: null, stage: -99, cropId: null, position: p });
  }
  function updateExpansion(unlockedRows, tilled) {
    // Only the underlying farm lawn expands. New land starts as grass and
    // individual plot placement reveals soil, timber borders and furrows.
    farmLawn.position.z = FARM.firstZ + (unlockedRows - 1) * FARM.spacing / 2;
    const lawnDepth = unlockedRows * FARM.spacing + 1.4;
    farmLawn.scaling.z = lawnDepth / 10.2;
    // Move the side fence forward as the underlying land grows.
    const lawnFront = farmLawn.position.z + lawnDepth / 2;
    for (const { z, post, rail } of westFenceSegments) {
      post.setEnabled(z <= lawnFront + .01);
      if (rail) rail.setEnabled(z + 1.4 <= lawnFront + .01);
    }
    const count = unlockedRows * FARM.columns;
    for (let i = 0; i < plots.length; i++) {
      const view = plots[i], unlocked = i < count, prepared = unlocked && tilled[i] === true;
      if (view.unlocked === unlocked && view.prepared === prepared) continue;
      view.unlocked = unlocked;
      view.prepared = prepared;
      view.soil.material = !unlocked ? materials.lockedGrass : prepared ? materials.soil : materials.ownedGrass;
      view.edge.setEnabled(prepared);
      view.furrows.forEach(mesh => mesh.setEnabled(prepared));
      view.lockDecor.setEnabled(!unlocked);
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

  // Back fence around the field. Each segment is a separate replaceable prop.
  for (let x = -10.15; x <= 1.05; x += 1.4) {
    box("fence rear post", .16, .79, .17, x, .48, -5.5, materials.woodLight);
    if (x < 1) {
      box("fence rear top rail", 1.38, .12, .09, x+.70, .67, -5.5, materials.cream);
      box("fence rear low rail", 1.38, .10, .09, x+.70, .37, -5.5, materials.woodLight);
    }
  }
  for (let z = -5.5; z <= 4.6; z += 1.4) {
    const post = box("fence west post", .17, .79, .16, -10.15, .48, z, materials.woodLight);
    const rail = z < 4.4
      ? box("fence west rail", .09, .13, 1.38, -10.15, .61, z+.7, materials.cream)
      : null;
    westFenceSegments.push({ z, post, rail });
  }

  // Warm cottage with a layered roof, steps, windows and a flower box.
  const hx = 7.0, hz = -4.50;
  box("house foundation", 4.7, .25, 4.5, hx, .22, hz, materials.rock);
  box("butter-yellow cottage", 4.15, 2.65, 3.9, hx, 1.61, hz, materials.cream);
  const leftRoof = box("cottage left roof", 2.82,.22,4.55,hx-1.06,3.45,hz,materials.roof);
  leftRoof.rotation.z = .52;
  const rightRoof = box("cottage right roof", 2.82,.22,4.55,hx+1.06,3.45,hz,materials.roofLight);
  rightRoof.rotation.z = -.52;
  box("wooden front door", 1.0,1.72,.08,hx,1.04,hz+2.0,materials.door);
  sphere("golden door knob",hx+.32,1.05,hz+2.06,.10,.10,.08,materials.flowerYellow);
  for (const wx of [hx-1.33,hx+1.33]) {
    box("window trim",.78,.89,.13,wx,1.91,hz+2.01,materials.woodLight);
    box("blue window",.59,.68,.14,wx,1.92,hz+2.08,materials.window);
    box("window crossbar",.09,.71,.15,wx,1.91,hz+2.15,materials.cream);
    box("flower window box",.91,.19,.36,wx,1.45,hz+2.19,materials.wood);
    for (const dx of [-.23,0,.23]) {
      sphere("window box greenery",wx+dx,1.60,hz+2.24,.22,.17,.21,materials.treeBright);
      sphere("window box bloom",wx+dx,1.73,hz+2.30,.10,.10,.10,materials.flowerPink);
    }
  }
  box("chimney",.58,1.1,.58,hx+1.0,4.04,hz-.8,materials.chimney);
  box("chimney cap",.75,.17,.73,hx+1.0,4.65,hz-.8,materials.cream);
  for (let i=0;i<4;i++) box("cottage doorstep",1.35+i*.3,.10,.46,hx,.11,hz+2.5+i*.47,materials.rock);

  // Winding stepping-stone trail between the farmhouse and garden.
  for (let i=0;i<7;i++) {
    const x = 1.45 + i*.66, z = -1.6 + Math.sin(i*.55)*.55;
    const stone = cylinder("garden path stone",x,.16,z,.11,.76,.86,materials.rock,9);
    stone.scaling.z = .65;
  }
  // Pond with rounded banks and simple lily pads.
  cylinder("pond earth border",7.5,.13,4.30,.14,5.65,5.95,materials.waterRim,40);
  cylinder("still pond water",7.5,.23,4.30,.06,5.20,5.25,materials.water,40);
  for (const [x,z] of [[6.4,4.2],[8.65,5.15],[7.8,3.26]]) {
    const pad = sphere("lily pad",x,.29,z,.58,.045,.44,materials.treeBright);
    pad.rotation.y = x;
    sphere("water lily",x+.13,.34,z,.20,.12,.19,materials.flowerPink);
  }

  // Deterministic details: consistent layout across page loads.
  let randomSeed = 7245;
  function rand() { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; }
  function tree(x,z,size=1) {
    cylinder("tree trunk",x,.55*size+.08,z,1.1*size,.21*size,.28*size,materials.treeTrunk);
    sphere("tree leafy crown",x,1.71*size,z,1.52*size,1.44*size,1.40*size,materials.treeDark);
    sphere("tree sunny crown",x-.28*size,2.14*size,z-.15*size,1.33*size,1.16*size,1.24*size,materials.tree);
    sphere("tree sunny highlight",x+.31*size,1.88*size,z+.18*size,1.05*size,1.01*size,1.04*size,materials.treeBright);
    sphere("tree base shadow",x,.14,z,1.3*size,.028,.9*size,materials.field);
  }
  for (const [x,z,s] of [[-11.45,-7.7,.8],[-8.4,-7.75,.67],[-3.0,-7.8,.61],[1.6,-7.9,.75],[11.1,-7.5,.75],[11.5,-1.1,.79],[11.1,7.55,.69],[2.5,7.9,.76],[-5.6,7.9,.72],[-11.45,6.65,.65]]) tree(x,z,s);
  for (let i=0;i<53;i++) {
    const x=-11.2+rand()*22.4, z=-8.3+rand()*16.6;
    if ((x>-9.9 && x<1.5 && z>-5.4 && z<4.8) ||
        (x>4.3 && x<9.9 && z>-7 && z<-1.6) ||
        Math.hypot(x-7.5,z-4.3)<3.2) continue;
    const variant = rand();
    if (variant < .28) {
      sphere("meadow shrub",x,.20,z,.34,.28,.33,materials.bush);
      sphere("shrub highlight",x-.11,.36,z-.06,.23,.21,.24,materials.treeBright);
    } else {
      cylinder("flower stem",x,.24,z,.3,.028,.034,materials.treeDark,5);
      sphere("wildflower",x,.43,z,.13,.12,.13,variant<.55?materials.flowerYellow:variant<.78?materials.flowerPink:materials.flower,7);
    }
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
