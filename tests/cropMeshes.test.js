import test from "node:test";
import assert from "node:assert/strict";
import { WHEAT_STAGES, buildCrop, createCropMaterials } from "../src/render/cropMeshes.js";

test("wheat increases density, height and ear size at each growth stage", () => {
  assert.equal(WHEAT_STAGES.length, 4);
  assert.deepEqual(WHEAT_STAGES.map(stage => stage.stalks), [6, 12, 19, 25]);
  assert.deepEqual(WHEAT_STAGES.map(stage => stage.kernels), [0, 1, 3, 4]);
  for (let index = 1; index < WHEAT_STAGES.length; index++) {
    assert.ok(WHEAT_STAGES[index].stalks > WHEAT_STAGES[index - 1].stalks);
    assert.ok(WHEAT_STAGES[index].height > WHEAT_STAGES[index - 1].height);
  }
  assert.equal(WHEAT_STAGES[0].stem, "wheatStemGreen");
  assert.equal(WHEAT_STAGES[1].stem, "wheatStemSoft");
  assert.equal(WHEAT_STAGES[2].stem, "wheatStemYellow");
  assert.equal(WHEAT_STAGES[3].stem, "wheatStemRipe");
  assert.equal(WHEAT_STAGES[3].ear, "wheatRipe");
  assert.equal(WHEAT_STAGES[3].grain, "wheatHighlightRipe");
});

test("wheat builds non-pickable batched geometry at every growth stage", () => {
  const savedBabylon = globalThis.BABYLON;
  const created = [];
  const merged = [];
  function node(name) {
    return {
      name, parent: null, isPickable: true,
      position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      scaling: { setAll(value) { this.value = value; }, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      rotation: { x: 0, y: 0, z: 0 },
      dispose() {},
    };
  }
  const B = {
    TransformNode: class { constructor(name) { Object.assign(this, node(name)); } },
    MeshBuilder: {
      CreateBox(name) { const mesh = node(name); created.push(mesh); return mesh; },
      CreateSphere(name) { const mesh = node(name); created.push(mesh); return mesh; },
      CreateCylinder(name) { const mesh = node(name); created.push(mesh); return mesh; },
    },
    Mesh: {
      MergeMeshes(meshes, disposeSource, allow32BitsIndices) {
        assert.ok(meshes.length > 1);
        assert.equal(disposeSource, true);
        assert.equal(allow32BitsIndices, true);
        const mesh = node("merged");
        merged.push({ mesh, count: meshes.length });
        return mesh;
      },
    },
    StandardMaterial: class { constructor(name) { this.name = name; } },
    Color3: class {
      constructor() {}
      static FromHexString(hex) { return { hex }; }
    },
  };
  globalThis.BABYLON = B;
  try {
    const materials = createCropMaterials({});
    const colors = WHEAT_STAGES.map(p => [p.stem, p.ear, p.grain, p.leaf]);
    for (const stage of [0, 1, 2, 3]) {
      const before = created.length;
      const parent = node("plot");
      const anchor = buildCrop({}, parent, "wheat", stage, materials);
      const stageMeshes = created.slice(before);
      // Each stalk uses a square stalk and blade, plus a core and grain
      // boxes as ears appear. Ready crops additionally include two sparkles.
      const profile = WHEAT_STAGES[stage];
      const expected = profile.stalks * (2 + (profile.kernels ? 1 + profile.kernels : 0)) + (stage === 3 ? 2 : 0);
      assert.equal(stageMeshes.length, expected);
      assert.equal(anchor.parent, parent);
      assert.ok(stageMeshes.every(mesh => !mesh.isPickable));
      assert.ok(colors[stage].every(name => materials[name]));
      assert.ok(merged.length > 0);
    }
    assert.ok(merged.length <= 16); // About four batches per growth stage.
    assert.ok(merged.every(batch => batch.mesh.isPickable === false));
  } finally {
    globalThis.BABYLON = savedBabylon;
  }
});
