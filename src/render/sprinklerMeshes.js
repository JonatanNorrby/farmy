// Simple, lightweight Babylon sprinkler made from primitives. The rotating
// nozzle is returned separately so world animation can spin it each frame.
export function createSprinklerMaterials(scene) {
  const B = globalThis.BABYLON;
  const palette = {
    body: "#8ca6a0", dark: "#466b6b", copper: "#b78053", highlight: "#c4d6b9",
  };
  return Object.fromEntries(Object.entries(palette).map(([name, hex]) => {
    const material = new B.StandardMaterial("sprinkler-" + name, scene);
    material.diffuseColor = B.Color3.FromHexString(hex);
    material.specularColor = new B.Color3(.14, .14, .12);
    return [name, material];
  }));
}

export function buildSprinkler(scene, root, materials) {
  const B = globalThis.BABYLON;
  function cylinder(name, diameterTop, diameterBottom, height, x, y, z, material, parent = root) {
    const mesh = B.MeshBuilder.CreateCylinder(name, {
      diameterTop, diameterBottom, height, tessellation: 10,
    }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  function sphere(name, size, x, y, z, material, parent = root) {
    const mesh = B.MeshBuilder.CreateSphere(name, { diameter: size, segments: 10 }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  cylinder("sprinkler base", .53, .70, .17, 0, .09, 0, materials.dark);
  cylinder("sprinkler pole", .13, .19, .94, 0, .62, 0, materials.body);
  cylinder("sprinkler valve", .30, .25, .20, 0, .97, 0, materials.copper);
  const head = new B.TransformNode("rotating sprinkler nozzle", scene);
  head.parent = root;
  head.position.y = 1.19;
  cylinder("sprinkler hub", .30, .34, .23, 0, 0, 0, materials.dark, head);
  for (const direction of [-1, 1]) {
    const arm = cylinder("sprinkler nozzle arm", .085, .085, .68, direction * .37, .02, 0, materials.body, head);
    arm.rotation.z = Math.PI / 2;
    cylinder("sprinkler nozzle tip", .14, .10, .17, direction * .75, .04, 0, materials.copper, head).rotation.z = Math.PI / 2;
    sphere("sprinkler nozzle accent", .09, direction * .83, .04, 0, materials.highlight, head);
  }
  return head;
}
