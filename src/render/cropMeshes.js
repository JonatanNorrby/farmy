// Procedural, low-poly crop models. Replace these with imported GLBs later
// without touching the crop economy, saving, or interaction code.

// Wheat matures from sparse green shoots into a compact golden field. Stages
// are shared by rendering tests; the farming/economy rules are unchanged.
export const WHEAT_STAGES = Object.freeze([
  Object.freeze({ stalks: 6, height: .34, kernels: 0, stem: "wheatStemGreen", ear: "wheatBud", grain: "wheatBud", leaf: "leaf" }),
  Object.freeze({ stalks: 12, height: .59, kernels: 1, stem: "wheatStemSoft", ear: "wheatBud", grain: "wheatBudLight", leaf: "leafLight" }),
  Object.freeze({ stalks: 19, height: .87, kernels: 3, stem: "wheatStemYellow", ear: "wheatGold", grain: "wheatHighlightGold", leaf: "wheatStemYellow" }),
  Object.freeze({ stalks: 25, height: 1.12, kernels: 4, stem: "wheatStemRipe", ear: "wheatRipe", grain: "wheatHighlightRipe", leaf: "wheatStemRipe" }),
]);

export function createCropMaterials(scene) {
  const B = globalThis.BABYLON;
  const palette = {
    leaf: "#619c52", leafLight: "#8dbf5f", leafDark: "#4b8150",
    carrot: "#ed8b48", carrotLight: "#f7ac57",
    wheatStemGreen: "#68954b", wheatStemSoft: "#9eab52",
    wheatStemYellow: "#cfb248", wheatStemRipe: "#dfbd45",
    wheatBud: "#a6b956", wheatBudLight: "#c7cc6b",
    wheatGold: "#edc64e", wheatHighlightGold: "#f9d96d",
    wheatRipe: "#f7d65a", wheatHighlightRipe: "#ffe57e",
    pumpkin: "#da8743", pumpkinRib: "#ec9850",
    sparkle: "#fff4bb", earth: "#584633",
  };
  const result = {};
  for (const [key, hex] of Object.entries(palette)) {
    const mat = new B.StandardMaterial("crop-" + key, scene);
    mat.diffuseColor = B.Color3.FromHexString(hex);
    mat.specularColor = new B.Color3(.045, .045, .035);
    result[key] = mat;
  }
  result.sparkle.emissiveColor = new B.Color3(.25, .19, .075);
  return result;
}

export function buildCrop(scene, root, cropId, stage, materials) {
  const B = globalThis.BABYLON;
  const anchor = new B.TransformNode(cropId + "-plant", scene);
  anchor.parent = root;
  const size = [ .24, .49, .78, 1 ][stage] ?? 1;
  if (cropId !== "wheat") anchor.scaling.setAll(size);

  function sphere(name, x, y, z, sx, sy, sz, material, parent = anchor) {
    const mesh = B.MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  function cylinder(name, x, y, z, height, top, bottom, material, parent = anchor, tessellation = 7) {
    const mesh = B.MeshBuilder.CreateCylinder(name, { height, diameterTop: top, diameterBottom: bottom, tessellation }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }

  if (cropId === "carrot") {
    const spots = [[-.46,-.27], [.37,-.34], [-.06,.34]];
    for (const [x,z] of spots) {
      cylinder("orange root", x, .23, z, .43, .32, .065, materials.carrot);
      sphere("root shoulder", x, .43, z, .33, .14, .32, materials.carrotLight);
      cylinder("stem", x, .59, z, .34, .055, .055, materials.leafDark);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        const leaf = sphere("carrot foliage", x + Math.cos(a) * .14, .76, z + Math.sin(a) * .14, .17, .37, .13, i === 0 ? materials.leafLight : materials.leaf);
        leaf.rotation.z = Math.cos(a) * -.45;
        leaf.rotation.x = Math.sin(a) * .45;
      }
    }
  } else if (cropId === "wheat") {
    const profile = WHEAT_STAGES[Math.max(0, Math.min(3, stage))];
    // Blocky ears and tightly packed square stalks give wheat the full, warm
    // Minecraft-like silhouette while retaining Farmy's existing art palette.
    // Create component boxes at the origin, then merge by material to keep
    // each crop to a handful of draw calls rather than hundreds of meshes.
    const batches = new Map();
    function voxel(name, x, y, z, width, height, depth, material, tilt = 0) {
      const mesh = B.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
      mesh.position.set(x, y, z);
      mesh.rotation.z = tilt;
      mesh.material = material;
      mesh.isPickable = false;
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(mesh);
    }
    // Fill from the center out, with deterministic small offsets. Every
    // subsequent growth stage adds stalks rather than just scaling four up.
    const spots = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        spots.push({
          row, col,
          x: (col - 2) * .32 + (((row * 7 + col * 3) % 5) - 2) * .024,
          z: (row - 2) * .32 + (((row * 5 + col * 11) % 5) - 2) * .022,
        });
      }
    }
    spots.sort((a, b) =>
      ((a.row - 2) ** 2 + (a.col - 2) ** 2) - ((b.row - 2) ** 2 + (b.col - 2) ** 2) ||
      a.row - b.row || a.col - b.col);
    spots.slice(0, profile.stalks).forEach(({ x, z }, i) => {
      const height = profile.height * (.91 + (i % 5) * .033);
      const lean = ((i % 5) - 2) * .035;
      voxel("square wheat stalk", x, height / 2, z, .052, height, .052, materials[profile.stem], lean);
      voxel("wheat side blade", x + .09, height * .43, z + .025,
        .068, height * .48, .035, materials[profile.leaf], -.4 + lean);
      if (profile.kernels) {
        voxel("wheat ear core", x, height + profile.kernels * .06, z,
          .085, profile.kernels * .14 + .04, .085, materials[profile.ear], lean);
        for (let k = 0; k < profile.kernels; k++) {
          voxel("golden grain", x + (k % 2 ? .064 : -.064),
            height + .065 + k * .115, z + ((i + k) % 2 ? .025 : -.025),
            .16, .137, .145, materials[profile.grain]);
        }
      }
    });
    for (const [material, meshes] of batches) {
      const merged = meshes.length === 1 ? meshes[0] :
        B.Mesh.MergeMeshes(meshes, true, true);
      if (!merged) throw new Error("Could not merge wheat geometry");
      merged.name = "wheat " + stage + " merged batch";
      merged.material = material;
      merged.isPickable = false;
      merged.parent = anchor;
    }
  } else if (cropId === "pumpkin") {
    const spots = [[-.35,-.19,.95], [.35,.27,.77]];
    for (const [x,z,scale] of spots) {
      const group = new B.TransformNode("pumpkin cluster", scene);
      group.parent = anchor;
      group.position.set(x, 0, z);
      group.scaling.setAll(scale);
      sphere("pumpkin body", 0, .4, 0, .78, .64, .76, materials.pumpkin, group);
      sphere("pumpkin rib left", -.16, .41, .01, .56, .65, .74, materials.pumpkinRib, group);
      sphere("pumpkin rib right", .16, .41, .01, .56, .65, .74, materials.pumpkinRib, group);
      cylinder("pumpkin stem", 0, .77, 0, .25, .09, .14, materials.leafDark, group);
      const leaf = sphere("pumpkin leaf", -.34, .69, .3, .46, .07, .27, materials.leaf, group);
      leaf.rotation.z = .18;
    }
    const vine = sphere("pumpkin vine", .05, .15, -.42, .85, .055, .08, materials.leafDark);
    vine.rotation.y = -.3;
  }

  if (stage === 3) {
    for (const [x,z] of [[-.58,-.49],[.57,.54]]) {
      const glint = sphere("ready sparkle", x, cropId === "wheat" ? 1.7 : 1.17, z, .11, .20, .11, materials.sparkle);
      glint.rotation.z = .7;
    }
  }
  return anchor;
}
