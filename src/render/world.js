import { plotPosition, PLOT_COUNT } from "../config/crops.js";
import { buildCrop, createCropMaterials } from "./cropMeshes.js";

export function createWorld(scene) {
  const B = globalThis.BABYLON;
  const materials = {};
  const colors = {
    grass: "#a4c883", edge: "#81a767", earthSide: "#9b7351", earthBottom: "#6c5844",
    field: "#9cbe75", plotEdge: "#bf9a6a", soil: "#786046", furrow: "#6d543b",
    cream: "#f5e8bd", roof: "#b96f57", roofLight: "#c68160", wood: "#986949",
    woodLight: "#c59565", door: "#795441", window: "#b9e5d9",
    treeTrunk: "#98754d", tree: "#6b9a60", treeBright: "#80ac68", treeDark: "#558751",
    waterRim: "#ded5a3", water: "#78b9aa", waterLight: "#a0d4b8",
    rock: "#cbd0a6", flower: "#f8e9cf", flowerPink: "#e9a8a0", flowerYellow: "#eccc76",
    bush: "#77a766", cloud: "#fff6db", chimney: "#9d8067",
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
  box("farm enclosure lawn", 12.45, .035, 10.2, -4.24, .111, -.22, materials.field);

  // Farm's 20 individual interactable plots.
  const plots = [];
  for (let i = 0; i < PLOT_COUNT; i++) {
    const p = plotPosition(i);
    box("plot timber edge " + i, 2.03, .15, 2.03, p.x, .20, p.z, materials.plotEdge);
    const soil = box("clickable garden soil " + i, 1.86, .09, 1.86, p.x, .292, p.z, materials.soil);
    soil.isPickable = true;
    soil.metadata = { plotIndex: i };
    for (const dz of [-.49, 0, .49]) box("soft tilled soil", 1.50, .04, .13, p.x, .354, p.z + dz, materials.furrow);
    plots.push({ soil, root: null, stage: -99, cropId: null, position: p });
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
    if (view.stage === stage && view.cropId === (plot ? plot.cropId : null)) return;
    if (view.root) view.root.dispose();
    view.root = null;
    view.stage = stage;
    view.cropId = plot ? plot.cropId : null;
    if (!plot) return;
    const root = new B.TransformNode("crop plot " + index, scene);
    root.position.set(view.position.x, .37, view.position.z);
    buildCrop(scene, root, plot.cropId, stage, cropMaterials);
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
    box("fence west post", .17, .79, .16, -10.15, .48, z, materials.woodLight);
    if (z < 4.4) box("fence west rail", .09, .13, 1.38, -10.15, .61, z+.7, materials.cream);
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
  // A few soft clouds hovering over the diorama.
  for (const [x,y,z] of [[-6,7,-2],[4,8,6]]) {
    sphere("cotton cloud",x,y,z,1.6,.52,.75,materials.cloud);
    sphere("cotton cloud puff",x+.7,y+.14,z,1.12,.73,.8,materials.cloud);
    sphere("cotton cloud puff",x-.6,y+.12,z,1.18,.66,.76,materials.cloud);
  }

  function animate(ms) {
    for (let i=0;i<plots.length;i++) {
      const root = plots[i].root;
      if (root) root.rotation.z = Math.sin(ms*.00125 + i*.7) * .024;
    }
  }
  return { plots, setHover, updatePlot, animate };
}
