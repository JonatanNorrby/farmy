// Babylon setup is deliberately isolated from simulation and UI.
export function createScene(canvas) {
  const B = globalThis.BABYLON;
  if (!B) throw new Error("Babylon.js could not load. Check your internet connection and refresh.");

  const engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
  // Limit high-DPI rendering cost while keeping crisp graphics on common screens.
  engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(.86, .93, .82, 1);
  scene.ambientColor = new B.Color3(.68, .69, .58);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogColor = new B.Color3(.86, .93, .82);
  scene.fogDensity = .003;

  const sun = new B.DirectionalLight("afternoon sun", new B.Vector3(-.6, -1, -.45), scene);
  sun.position = new B.Vector3(-12, 22, 6);
  sun.intensity = 1.35;
  sun.diffuse = new B.Color3(1, .94, .79);
  const sky = new B.HemisphericLight("soft sky", new B.Vector3(0, 1, 0), scene);
  sky.intensity = .83;
  sky.groundColor = new B.Color3(.49, .61, .44);

  const camera = new B.ArcRotateCamera("isometric", Math.PI / 4, 1.03, 32, new B.Vector3(0, .1, -.2), scene);
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
  // On narrow screens, dragging an empty area lets the player inspect the farm.
  let drag = null;
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 2) return;
    drag = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  window.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("pointermove", event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const scale = (camera.orthoTop - camera.orthoBottom) / Math.max(1, canvas.clientHeight);
    // Move in camera-space ground-plane axes.
    camera.target.x -= (dx + dy) * scale * .48;
    camera.target.z -= (dy - dx) * scale * .48;
    camera.target.x = Math.max(-6, Math.min(6, camera.target.x));
    camera.target.z = Math.max(-5, Math.min(5, camera.target.z));
    drag = { x: event.clientX, y: event.clientY };
  });
  resize();
  return { B, engine, scene, camera, resize };
}
