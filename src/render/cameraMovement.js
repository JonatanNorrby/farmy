import { FARM, landBounds } from "../config/crops.js";

// Camera movement works in screen space: horizontal drag follows the camera's
// right axis and vertical drag follows its up axis, projected onto the ground.
// Solving both axes avoids diagonal drift in the fixed isometric view.
export const DRAG_THRESHOLD_PX = 6;
export const KEY_PAN_SPEED = 4.5; // Orthographic screen-world units / second.

export function groundDelta(right, up, screenRight, screenUp) {
  const det = right.x * up.z - right.z * up.x;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-5) return { x: 0, z: 0 };
  return {
    x: (screenRight * up.z - right.z * screenUp) / det,
    z: (right.x * screenUp - screenRight * up.x) / det,
  };
}
export function clampPan(target, bounds) {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, target.x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, target.z)),
  };
}
export function cameraPanBounds() {
  const full = landBounds(FARM.maxLevel);
  return {
    minX: full.minX - 4, maxX: full.maxX + 4,
    minZ: full.minZ - 4, maxZ: full.maxZ + 4,
  };
}

export function createCameraMovement(camera, canvas, B) {
  const keys = new Set();
  const bounds = cameraPanBounds();

  function screenAxes() {
    const matrix = camera.getWorldMatrix();
    return {
      right: B.Vector3.TransformNormal(B.Axis.X, matrix),
      up: B.Vector3.TransformNormal(B.Axis.Y, matrix),
    };
  }
  function move(screenRight, screenUp) {
    if (!screenRight && !screenUp) return false;
    const { right, up } = screenAxes();
    const delta = groundDelta(right, up, screenRight, screenUp);
    const next = clampPan({ x: camera.target.x + delta.x, z: camera.target.z + delta.z }, bounds);
    const moved = next.x !== camera.target.x || next.z !== camera.target.z;
    camera.target.x = next.x;
    camera.target.z = next.z;
    return moved;
  }
  function drag(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const worldPerPixel = (camera.orthoTop - camera.orthoBottom) /
      Math.max(1, canvas.clientHeight);
    // Moving a finger right/down moves the displayed farm right/down.
    return move(-dx * worldPerPixel, dy * worldPerPixel);
  }
  function setKey(key, pressed) {
    const k = key.toLowerCase();
    if (!["w", "a", "s", "d"].includes(k)) return false;
    if (pressed) keys.add(k);
    else keys.delete(k);
    return true;
  }
  function clearKeys() { keys.clear(); }
  function update(seconds, enabled = true) {
    if (!enabled || !Number.isFinite(seconds) || seconds <= 0) return false;
    let dx = Number(keys.has("d")) - Number(keys.has("a"));
    let dy = Number(keys.has("w")) - Number(keys.has("s"));
    const length = Math.hypot(dx, dy);
    if (!length) return false;
    const step = KEY_PAN_SPEED * Math.min(seconds, .05) / length;
    return move(dx * step, dy * step);
  }
  return { drag, setKey, clearKeys, update };
}
