import test from "node:test";
import assert from "node:assert/strict";
import { FARM, PLOT_COUNT, plotPosition } from "../src/config/crops.js";
import { newFarm } from "../src/game/farm.js";
import { createWorld } from "../src/render/world.js";

// Test scene composition without WebGL: building the farm must not add the
// former house, pond, trees, flowers, path, floating island, or other props.
function mockBabylon() {
  const meshes = [], nodes = [];
  function node(name) {
    const object = {
      name,
      enabled: true,
      position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } },
      rotation: { x: 0, y: 0, z: 0 },
      scaling: { x: 1, y: 1, z: 1, set(x, y, z) { Object.assign(this, { x, y, z }); } },
      setEnabled(value) { this.enabled = value; },
      dispose() { this.disposed = true; },
    };
    nodes.push(object);
    return object;
  }
  class Color3 {
    constructor(r, g, b) { Object.assign(this, { r, g, b }); }
    static FromHexString(hex) { return { hex }; }
  }
  class StandardMaterial { constructor(name) { this.name = name; } }
  class DynamicTexture {
    constructor() {
      this.context = {
        createRadialGradient() { return { addColorStop() {} }; },
        fillRect() {},
      };
    }
    getContext() { return this.context; }
    update() {}
  }
  const BABYLON = {
    Color3, StandardMaterial, DynamicTexture,
    TransformNode: class { constructor(name) { return node(name); } },
    MeshBuilder: {
      CreateBox(name, dimensions) {
        const mesh = node(name);
        mesh.dimensions = dimensions;
        meshes.push(mesh);
        return mesh;
      },
      CreateCylinder() { throw new Error("World contains an unexpected cylinder/scenery object"); },
      CreateSphere() { throw new Error("World contains an unexpected sphere/scenery object"); },
    },
  };
  return { BABYLON, meshes, nodes };
}

test("farm scene contains only farmland, plots, and their hover affordance", () => {
  const previous = globalThis.BABYLON;
  const mock = mockBabylon();
  globalThis.BABYLON = mock.BABYLON;
  try {
    const world = createWorld({});
    const names = mock.meshes.map(mesh => mesh.name);
    assert.equal(world.plots.length, PLOT_COUNT);
    assert.equal(mock.meshes.length, 2 + PLOT_COUNT * 5 + 4);
    assert.deepEqual(names.slice(0, 2), ["farm foundation", "owned farm lawn"]);
    assert.equal(names.filter(name => name.startsWith("clickable garden patch")).length, PLOT_COUNT);
    assert.equal(names.filter(name => name === "plot highlight").length, 4);
    assert.equal(mock.meshes.filter(mesh => mesh.isPickable).length, PLOT_COUNT);
    for (let i = 0; i < PLOT_COUNT; i++) {
      assert.deepEqual(world.plots[i].soil.metadata, { plotIndex: i });
      assert.equal(world.plots[i].soil.position.x, plotPosition(i).x);
      assert.equal(world.plots[i].soil.position.z, plotPosition(i).z);
    }
    world.setHover(0);
    const marker = mock.nodes.find(node => node.name === "hover outline");
    assert.equal(marker.enabled, true);
    assert.equal(marker.position.x, plotPosition(0).x);
    world.setHover(null);
    assert.equal(marker.enabled, false);
    for (const api of ["updateExpansion", "updatePlot", "playWatering", "playSprinklerWatering", "animate"]) {
      assert.equal(typeof world[api], "function");
    }
  } finally {
    globalThis.BABYLON = previous;
  }
});

test("owned grass, prepared soil and unowned land remain visually distinct", () => {
  const previous = globalThis.BABYLON;
  const mock = mockBabylon();
  globalThis.BABYLON = mock.BABYLON;
  try {
    const world = createWorld({});
    const farm = newFarm();
    world.updateExpansion(farm.unlockedRows, farm.tilled);
    const prepared = world.plots[0], ownedGrass = world.plots[2], lockedGrass = world.plots[10];
    assert.equal(prepared.soil.material.name, "soil");
    assert.equal(prepared.edge.enabled, true);
    assert.equal(ownedGrass.soil.material.name, "ownedGrass");
    assert.equal(ownedGrass.edge.enabled, false);
    assert.equal(lockedGrass.soil.material.name, "lockedGrass");
    assert.equal(lockedGrass.edge.enabled, false);
    const lawn = mock.meshes.find(mesh => mesh.name === "owned farm lawn");
    assert.equal(lawn.scaling.z, (FARM.initialRows * FARM.spacing + 1.4) / (FARM.rows * FARM.spacing + 1.4));
    const tilled = farm.tilled.slice();
    tilled[14] = true;
    world.updateExpansion(3, tilled);
    assert.equal(world.plots[14].soil.material.name, "soil");
    assert.equal(world.plots[14].edge.enabled, true);
    assert.equal(world.plots[19].soil.material.name, "lockedGrass");
    assert.equal(lawn.scaling.z, (3 * FARM.spacing + 1.4) / (FARM.rows * FARM.spacing + 1.4));
    assert.equal(mock.meshes.length, 2 + PLOT_COUNT * 5 + 4); // No scenery spawned on expansion.
  } finally {
    globalThis.BABYLON = previous;
  }
});
