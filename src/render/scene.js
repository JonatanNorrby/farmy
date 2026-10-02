import { DEFAULT_BRIGHTNESS, normalizeBrightness, exposureForBrightness } from "../game/settings.js";
import { FARM, landBounds } from "../config/crops.js";
import { createCameraMovement } from "./cameraMovement.js";

// Babylon setup is deliberately isolated from simulation and UI.
export function createScene(canvas) {
  const B = globalThis.BABYLON;
  if (!B) throw new Error("Babylon.js could not load. Check your internet connection and refresh.");

  const engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
  // Limit high-DPI rendering cost while keeping crisp graphics on common screens.
  engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
  const scene = new B.Scene(engine);
  // Muted late-afternoon atmosphere rather than the old bright midday look.
  scene.clearColor = new B.Color4(.54, .58, .49, 1);
  scene.ambientColor = new B.Color3(.30, .25, .19);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogColor = new B.Color3(.54, .58, .49);
  scene.fogDensity = .003;
  // Brightness changes the image-processing exposure, not the sunlight's
  // color or direction, preserving the warm late-afternoon art direction.
  const baseExposure = .76;
  function setBrightness(value) {
    const brightness = normalizeBrightness(value);
    scene.imageProcessingConfiguration.exposure = exposureForBrightness(brightness, baseExposure);
    return brightness;
  }
  setBrightness(DEFAULT_BRIGHTNESS);
  scene.imageProcessingConfiguration.contrast = 1.12;

  // Lower-angle amber sunlight with cooler, much dimmer fill for depth.
  const sun = new B.DirectionalLight("golden hour sun", new B.Vector3(.68, -.74, -.32), scene);
  sun.position = new B.Vector3(-18, 15, 8);
  sun.intensity = 1.0;
  sun.diffuse = new B.Color3(1, .70, .43);
  sun.specular = new B.Color3(.86, .53, .26);
  const sky = new B.HemisphericLight("soft dusk fill", new B.Vector3(0, 1, 0), scene);
  sky.intensity = .37;
  sky.diffuse = new B.Color3(.72, .75, .80);
  sky.groundColor = new B.Color3(.40, .29, .22);

  const startLand = landBounds(FARM.initialLevel);
  const camera = new B.ArcRotateCamera("isometric", Math.PI / 4, 1.03, 32,
    new B.Vector3((startLand.minX + startLand.maxX) / 2, .1,
      (startLand.minZ + startLand.maxZ) / 2), scene);
  camera.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
  camera.inputs.clear(); // Locked isometric view, not a freely orbiting editor.
  camera.minZ = .1;
  camera.maxZ = 110;
  scene.activeCamera = camera;

  let zoom = 1;
  function resize() {
    engine.resize();
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const halfHeight = window.innerWidth < 650 ? 19 : 14.7;
    camera.orthoTop = halfHeight * zoom;
    camera.orthoBottom = -halfHeight * zoom;
    camera.orthoLeft = -halfHeight * zoom * aspect;
    camera.orthoRight = halfHeight * zoom * aspect;
  }
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    zoom = Math.min(1.65, Math.max(.72, zoom + Math.sign(event.deltaY) * .07));
    resize();
  }, { passive: false });
  // Pointer gestures are coordinated in main.js so painting never fights
  // camera dragging. Both right-drag and ordinary drag use this controller.
  const cameraMovement = createCameraMovement(camera, canvas, B);
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  resize();
  return { B, engine, scene, camera, resize, setBrightness, cameraMovement };
}
