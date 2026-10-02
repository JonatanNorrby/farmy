import test from "node:test";
import assert from "node:assert/strict";
import { FARM, landBounds } from "../src/config/crops.js";
import { newFarm, paintSoil } from "../src/game/farm.js";
import { createWorld } from "../src/render/world.js";

function mockBabylon() {
  const meshes = [];
  const nodes = [];
  function node(name, dimensions = {}) {
    const object = {
      name, dimensions, enabled: true, isPickable: true, parent: null,
      position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } },
      scaling: { x: 1, y: 1, z: 1, set(x, y, z) { Object.assign(this, { x, y, z }); } },
      rotation: { x: 0, y: 0, z: 0 },
      setEnabled(enabled) { this.enabled = enabled; },
      dispose() { this.disposed = true; },
    };
    nodes.push(object);
    return object;
  }
  class Color3 {
    constructor() {}
    static FromHexString(hex) { return { hex }; }
  }
  class StandardMaterial { constructor(name) { this.name = name; } }
  class DynamicTexture {
    getContext() { return {
      createRadialGradient() { return { addColorStop() {} }; },
      fillRect() {},
    }; }
    update() {}
  }
  return {
    meshes, nodes,
    BABYLON: {
      Color3, StandardMaterial, DynamicTexture,
      TransformNode: class { constructor(name) { return node(name); } },
      MeshBuilder: {
        CreateBox(name, dimensions) { const mesh = node(name, dimensions); meshes.push(mesh); return mesh; },
        CreateCylinder(name, dimensions) { const mesh = node(name, dimensions); meshes.push(mesh); return mesh; },
        CreateSphere() { throw Error("Unexpected scenery object"); },
      },
    },
  };
}
test("the only pickable surface is continuous ground, never a tile grid", () => {
  const previous = globalThis.BABYLON, mock = mockBabylon();
  globalThis.BABYLON = mock.BABYLON;
  try {
    const world = createWorld({});
    assert.equal(mock.meshes.length, 3); // full ground, owned lawn, circular cursor
    assert.deepEqual(mock.meshes.map(mesh => mesh.name),
      ["continuous farm ground", "owned farm surface", "round soil brush"]);
    assert.equal(world.ground.metadata.farmSurface, true);
    assert.equal(mock.meshes.filter(mesh => mesh.isPickable).length, 1);
    world.setHover({ x: -3.125, z: -.5 });
    const marker = mock.meshes.find(mesh => mesh.name === "round soil brush");
    assert.equal(marker.enabled, true);
    assert.equal(marker.position.x, -3.125);
    world.setHover(null);
    assert.equal(marker.enabled, false);
  } finally {
    globalThis.BABYLON = previous;
  }
});
test("painting creates freely positioned round soil dabs and expansion extends lawn", () => {
  const previous = globalThis.BABYLON, mock = mockBabylon();
  globalThis.BABYLON = mock.BABYLON;
  try {
    const world = createWorld({});
    let farm = newFarm();
    world.updateLand(farm.landLevel);
    world.syncPatches(farm.patches, 1000);
    assert.equal(world.views.length, 4);
    assert.equal(mock.meshes.filter(mesh => mesh.name.startsWith("painted soil")).length, 4);
    assert.equal(mock.meshes.filter(mesh => mesh.name === "soft soil furrow").length, 12);
    assert.equal(mock.meshes.filter(mesh => mesh.isPickable).length, 1);
    const first = world.views[0];
    assert.equal(first.circle.position.x, farm.patches[0].x);
    assert.equal(first.circle.position.z, farm.patches[0].z);
    assert.equal(first.circle.dimensions.diameter, FARM.patchRadius * 2);
    const stroke = paintSoil({ ...farm, coins: 200 },
      { x: -4.2, z: -.7 }, { x: -1.7, z: -.7 });
    assert.equal(stroke.ok, true);
    farm = stroke.state;
    world.syncPatches(farm.patches, 1500);
    assert.equal(world.views.length, farm.patches.length);
    const last = world.views.at(-1);
    assert.equal(last.circle.position.x, farm.patches.at(-1).x);
    assert.equal(last.circle.position.z, farm.patches.at(-1).z);
    const lawn = mock.meshes.find(mesh => mesh.name === "owned farm surface");
    assert.equal(lawn.scaling.z,
      (landBounds(FARM.initialLevel).maxZ - FARM.minZ) / (landBounds(FARM.maxLevel).maxZ - FARM.minZ));
    world.updateLand(3);
    assert.equal(lawn.scaling.z,
      (landBounds(3).maxZ - FARM.minZ) / (landBounds(FARM.maxLevel).maxZ - FARM.minZ));
    world.syncPatches(newFarm().patches, 2000);
    assert.equal(world.views.length, 4);
    assert.equal(last.circle.disposed, true);
    assert.equal(mock.meshes.filter(mesh => mesh.isPickable).length, 1);
    for (const method of ["setHover","updateLand","syncPatches","playWatering","playSprinklerWatering","animate"]) {
      assert.equal(typeof world[method], "function");
    }
  } finally {
    globalThis.BABYLON = previous;
  }
});
