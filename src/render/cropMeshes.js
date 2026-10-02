// Procedural, low-poly crop models. Replace these with imported GLBs later
// without touching the crop economy, saving, or interaction code.
export function createCropMaterials(scene) {
  const B = globalThis.BABYLON;
  const palette = {
    leaf: "#619c52", leafLight: "#8dbf5f", leafDark: "#4b8150",
    carrot: "#ed8b48", carrotLight: "#f7ac57",
    wheat: "#e6c76b", wheatLight: "#f7e09b", stalk: "#99a95c",
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
  anchor.scaling.setAll(size);

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
    const spots = [[-.4,-.3], [.13,-.37], [.45,.24], [-.28,.35]];
    for (const [x,z] of spots) {
      const stem = cylinder("wheat stalk", x, .56, z, 1.03, .035, .05, materials.stalk);
      stem.rotation.z = x * -.13;
      const head = sphere("golden wheat ear", x, 1.13, z, .15, .36, .15, materials.wheat);
      for (let j = 0; j < 4; j++) {
        sphere("wheat grains", x + (j % 2 ? .075 : -.075), .96 + j * .115, z, .11, .15, .12, materials.wheatLight);
      }
      const blade = sphere("wheat blade", x + .13, .39, z, .08, .32, .07, materials.leafLight);
      blade.rotation.z = -.7;
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
      const glint = sphere("ready sparkle", x, 1.17, z, .11, .20, .11, materials.sparkle);
      glint.rotation.z = .7;
    }
  }
  return anchor;
}
