import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAG_THRESHOLD_PX, KEY_PAN_SPEED, groundDelta, clampPan,
  cameraPanBounds, createCameraMovement, pointerGestureMode, crossedDragThreshold,
} from "../src/render/cameraMovement.js";
import { FARM, landBounds } from "../src/config/crops.js";

function mockCamera() {
  const camera = {
    target: { x: -4, y: .1, z: -1 },
    orthoTop: 10, orthoBottom: -10,
    getWorldMatrix: () => ({}),
  };
  const B = {
    Axis: { X: "right", Y: "up" },
    Vector3: {
      // The ground projection of screen up is shorter at the isometric angle.
      TransformNormal(axis) {
        return axis === "right" ? { x: 1, z: 0 } : { x: 0, z: .5 };
      },
    },
  };
  return { camera, canvas: { clientHeight: 1000 }, B };
}

test("screen pan projects both axes onto the ground without diagonal drift", () => {
  const right = { x: 1, z: 0 }, up = { x: 0, z: .5 };
  assert.deepEqual(groundDelta(right, up, 2, 1), { x: 2, z: 2 });
  assert.deepEqual(groundDelta(right, up, -2, -1), { x: -2, z: -2 });
  assert.deepEqual(groundDelta(right, { x: 2, z: 0 }, 2, 1), { x: 0, z: 0 });
  // Rotated bases also satisfy both independent screen projections.
  const slanted = groundDelta({ x: .7, z: -.7 }, { x: -.35, z: -.35 }, 2, -1);
  assert.ok(Math.abs(.7 * slanted.x - .7 * slanted.z - 2) < 1e-9);
  assert.ok(Math.abs(-.35 * slanted.x - .35 * slanted.z + 1) < 1e-9);
});

test("pointer drag is zoom-scaled and moves the farm in the drag direction", () => {
  const { camera, canvas, B } = mockCamera();
  const movement = createCameraMovement(camera, canvas, B);
  assert.equal(movement.drag(20, 10), true);
  assert.ok(Math.abs(camera.target.x - (-4.4)) < 1e-9);
  assert.ok(Math.abs(camera.target.z - (-.6)) < 1e-9);
  camera.orthoTop = 20;
  camera.orthoBottom = -20;
  movement.drag(20, 10);
  assert.ok(Math.abs(camera.target.x - (-5.2)) < 1e-9);
  assert.ok(Math.abs(camera.target.z - .2) < 1e-9);
  assert.equal(movement.drag(NaN, 0), false);
  assert.equal(movement.drag(0, Infinity), false);
  assert.equal(DRAG_THRESHOLD_PX, 6);
});

test("WASD pans relative to the fixed camera, supports diagonals and key release", () => {
  const { camera, canvas, B } = mockCamera();
  const movement = createCameraMovement(camera, canvas, B);
  assert.equal(movement.setKey("x", true), false);
  assert.equal(movement.setKey("D", true), true);
  assert.equal(movement.update(.05), true);
  assert.ok(Math.abs(camera.target.x - (-4 + KEY_PAN_SPEED * .05)) < 1e-9);
  const beforeW = camera.target.z;
  movement.setKey("w", true);
  movement.update(.05);
  assert.ok(camera.target.z > beforeW);
  const dx = camera.target.x - (-4 + KEY_PAN_SPEED * .05);
  assert.ok(Math.abs(dx - KEY_PAN_SPEED * .05 / Math.sqrt(2)) < 1e-9);
  movement.setKey("d", false);
  movement.setKey("w", false);
  assert.equal(movement.update(.05), false);
  movement.setKey("a", true);
  assert.equal(movement.update(.05, false), false); // Pause during painting/settings.
  movement.clearKeys();
  assert.equal(movement.update(.05), false);
  assert.equal(movement.update(-1), false);
});

test("movement clamps camera to the full farmland plus a navigation margin", () => {
  const { camera, canvas, B } = mockCamera();
  const bounds = cameraPanBounds();
  const land = landBounds(FARM.maxLevel);
  assert.ok(bounds.minX < land.minX && bounds.maxZ > land.maxZ);
  assert.deepEqual(clampPan({ x: -1000, z: 1000 }, bounds),
    { x: bounds.minX, z: bounds.maxZ });
  const movement = createCameraMovement(camera, canvas, B);
  movement.drag(1000000, -1000000);
  assert.equal(camera.target.x, bounds.minX);
  assert.equal(camera.target.z, bounds.minZ);
  movement.setKey("s", true);
  assert.equal(movement.update(.05), false); // Already at minimum Z.
  movement.clearKeys();
  movement.drag(-1000000, 1000000);
  assert.equal(camera.target.x, bounds.maxX);
  assert.equal(camera.target.z, bounds.maxZ);
  assert.deepEqual(clampPan({ x: 0, z: 0 }, bounds), { x: 0, z: 0 });
});

test("left clicks remain interactions, drags pan, and Plot painting is unaffected", () => {
  assert.equal(pointerGestureMode(0, "wheat", true), "pending");
  assert.equal(pointerGestureMode(0, "wheat", true, true), "seed-pending");
  assert.equal(pointerGestureMode(0, "wheat", true, false), "pending");
  assert.equal(pointerGestureMode(0, "wheat", false, true), "seed-pending");
  assert.equal(pointerGestureMode(2, "wheat", true, true), "pan");
  assert.equal(pointerGestureMode(0, "water", true), "pending");
  assert.equal(pointerGestureMode(0, "sprinkler", true), "pending");
  assert.equal(pointerGestureMode(0, "plot", true), "paint");
  assert.equal(pointerGestureMode(0, "plot", false), "pending"); // Click can expand, drag pans.
  assert.equal(pointerGestureMode(2, "plot", true), "pan");
  assert.equal(pointerGestureMode(2, "wheat", true), "pan");
  assert.equal(pointerGestureMode(1, "wheat", true), null);
  assert.equal(crossedDragThreshold(100, 100, 105, 100), false);
  assert.equal(crossedDragThreshold(100, 100, 106, 100), true);
  assert.equal(crossedDragThreshold(100, 100, 104, 105), true);
  assert.equal(crossedDragThreshold(100, 100, 100, 100), false);
});
