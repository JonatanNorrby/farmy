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

  // A compact outward spray from a sprinkler nozzle to a specific crop. The
  // simulation decides who is watered; particles are just one-shot feedback.
  function spray(source, target) {
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const length = Math.hypot(dx, dz) || 1;
    const stream = system("sprinkler spray", 75);
    stream.emitter = new B.Vector3(source.x, 1.48, source.z);
    stream.minEmitBox = new B.Vector3(-.06, 0, -.06);
    stream.maxEmitBox = new B.Vector3(.06, .04, .06);
    const speed = length / .72;
    const velocity = new B.Vector3(dx / length * speed, .75, dz / length * speed);
    stream.direction1 = velocity.scale(.93);
    stream.direction2 = velocity.scale(1.07);
    stream.minEmitPower = .93;
    stream.maxEmitPower = 1.07;
    stream.gravity = new B.Vector3(0, -5.0, 0);
    stream.minSize = .045;
    stream.maxSize = .095;
    stream.minLifeTime = .58;
    stream.maxLifeTime = .79;
    stream.emitRate = 135;
    stream.targetStopDuration = .23;
    stream.start();

    const splash = system("sprinkler splash", 34);
    splash.emitter = new B.Vector3(target.x, .45, target.z);
    splash.minEmitBox = new B.Vector3(-.22, 0, -.22);
    splash.maxEmitBox = new B.Vector3(.22, .02, .22);
    splash.direction1 = new B.Vector3(-.5, .8, -.5);
    splash.direction2 = new B.Vector3(.5, 1.25, .5);
    splash.minEmitPower = .55;
    splash.maxEmitPower = .85;
    splash.gravity = new B.Vector3(0, -4.3, 0);
    splash.minSize = .035;
    splash.maxSize = .075;
    splash.minLifeTime = .25;
    splash.maxLifeTime = .42;
    splash.emitRate = 130;
    splash.targetStopDuration = .15;
    window.setTimeout(() => {
      if (!scene.isDisposed) splash.start();
      else splash.dispose();
    }, 510);
  }

  return { play, spray };
}
