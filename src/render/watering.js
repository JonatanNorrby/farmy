// Short, reusable Babylon particle effect. The droplet sprite is drawn once
// in memory, so watering does not fetch assets or spawn extra scene meshes.
export function createWateringEffect(scene) {
  const B = globalThis.BABYLON;
  const texture = new B.DynamicTexture("water particle sprite", { width: 32, height: 32 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(.48, "rgba(220,245,255,.95)");
  gradient.addColorStop(1, "rgba(170,215,245,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  texture.hasAlpha = true;
  texture.update(false);

  function system(name, count) {
    const particles = new B.ParticleSystem(name, count, scene);
    particles.particleTexture = texture;
    particles.blendMode = B.ParticleSystem.BLENDMODE_STANDARD;
    particles.color1 = new B.Color4(.56, .84, .98, .95);
    particles.color2 = new B.Color4(.80, .95, 1, .80);
    particles.colorDead = new B.Color4(.52, .78, .96, 0);
    particles.disposeOnStop = true; // each burst cleans up after itself
    return particles;
  }

  function play(position) {
    const { x, z } = position;
    // Little arc from the left of the plant, like a tilted watering can.
    const stream = system("watering stream", 90);
    stream.emitter = new B.Vector3(x - .78, 1.55, z - .13);
    stream.minEmitBox = new B.Vector3(-.06, -.04, -.10);
    stream.maxEmitBox = new B.Vector3(.06, .04, .10);
    stream.direction1 = new B.Vector3(.77, -.18, -.18);
    stream.direction2 = new B.Vector3(1.00, -.40, .16);
    stream.minEmitPower = 1.0;
    stream.maxEmitPower = 1.32;
    stream.gravity = new B.Vector3(0, -4.8, 0);
    stream.minSize = .055;
    stream.maxSize = .115;
    stream.minLifeTime = .48;
    stream.maxLifeTime = .77;
    stream.emitRate = 155;
    stream.targetStopDuration = .45;
    stream.start();

    // A small puff of droplets where the stream lands.
    const splash = system("watering splash", 45);
    splash.emitter = new B.Vector3(x, .46, z);
    splash.minEmitBox = new B.Vector3(-.28, 0, -.23);
    splash.maxEmitBox = new B.Vector3(.28, .03, .23);
    splash.direction1 = new B.Vector3(-.55, .75, -.5);
    splash.direction2 = new B.Vector3(.55, 1.45, .5);
    splash.minEmitPower = .6;
    splash.maxEmitPower = 1.1;
    splash.gravity = new B.Vector3(0, -4.3, 0);
    splash.minSize = .035;
    splash.maxSize = .09;
    splash.minLifeTime = .25;
    splash.maxLifeTime = .44;
    splash.emitRate = 115;
    splash.targetStopDuration = .23;
    // The splash appears just after the first droplets reach the plant.
    window.setTimeout(() => {
      if (!scene.isDisposed) splash.start();
      else splash.dispose();
    }, 280);
  }

  return { play };
}
