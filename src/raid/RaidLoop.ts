import * as THREE from 'three';
import { createPhysics, addStaticBox } from '../core/physics';
import { Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';
import { RetroPipeline } from '../render/retro';
import { lambert, COL, CUES } from '../render/palette';
import { createBoxGeometryWithUV } from '../render/boxGeometry';
import { VISUAL, PERF } from '../config/settings';
import { createOverlays } from '../ui/overlays';

export async function startRaid(root: HTMLElement) {
  const world = await createPhysics();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const gfx = new RetroPipeline(renderer);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VISUAL.fog.color);
  scene.fog = new THREE.Fog(VISUAL.fog.color, VISUAL.fog.near, VISUAL.fog.far);
  const L = VISUAL.lighting;
  scene.add(new THREE.HemisphereLight(L.ambient, 0, 0.7));
  const sun = new THREE.DirectionalLight(L.sun, 0.8);
  sun.position.set(...L.sunDir).multiplyScalar(40);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(VISUAL.fov, 16 / 9, VISUAL.camera.near, VISUAL.camera.far);
  addEventListener('resize', () => {
    gfx.setResolution(VISUAL.internalHeight, innerWidth / innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const box = (c: [number, number, number], s: [number, number, number], col: number, collide = true) => {
    if (collide) addStaticBox(world, c, s);
    const geo = createBoxGeometryWithUV(...s);
    const m = new THREE.Mesh(geo, lambert(col));
    m.position.set(...c);
    scene.add(m);
    return m;
  };
  box([0, -0.5, 0], [200, 1, 200], COL.floorTile);
  box([8, 0.75, -10], [4, 1.5, 4], COL.oliveMid);
  box([-8, 1.5, -14], [6, 3, 6], COL.oliveMid);
  box([0, 4, -30], [12, 8, 12], COL.oliveMid);
  for (let i = 0; i < 5; i++) box([-6 + i * 3, 0.2 * (i + 1), -4], [3, 0.4 * (i + 1), 1], COL.oliveDark);

  // 가독성 표시: 금속 구조물, 물웅덩이, 탈출 지점
  const metalBox = new THREE.Mesh(createBoxGeometryWithUV(3, 3, 3), lambert(COL.steelDark, { emissive: CUES.conductor }));
  metalBox.position.set(16, 1.5, -8);
  scene.add(metalBox);

  const water = new THREE.Mesh(createBoxGeometryWithUV(14, 0.06, 14), lambert(COL.grout, { emissive: CUES.conductor, fog: false }));
  water.position.set(-16, 0.03, 8);
  scene.add(water);

  const exit = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 14, 6), lambert(COL.oliveDark, { emissive: CUES.exit, fog: false }));
  exit.position.set(0, 7, -60);
  scene.add(exit);

  const player = new PlayerController(world, camera, new THREE.Vector3(0, 1, 6));
  if (import.meta.env.DEV) (window as any).__game = { player, gfx, input: null, world };

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;color:#7fbf6a;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);

  const input = new Input(renderer.domElement, root);
  if (import.meta.env.DEV) (window as any).__game.input = input;

  const overlays = createOverlays(root, () => input.touch.enabled);
  let last = performance.now(), frames = 0, accum = 0, cooldown = 3;

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    player.update(dt, input);
    world.step();
    gfx.render(scene, camera, now / 1000);

    frames++;
    accum += dt;
    cooldown -= dt;
    if (accum >= 1) {
      const fps = frames / accum;
      overlays.setFps(fps, gfx.height);
      if (PERF.autoResolution && cooldown <= 0 && fps < PERF.targetFps && gfx.height > VISUAL.minInternalHeight) {
        gfx.setResolution(gfx.height * PERF.autoResolutionStep, innerWidth / innerHeight);
        cooldown = 3;
      }
      frames = 0;
      accum = 0;
    }
    overlays.updateOrientation();

    hud.textContent = input.active
      ? `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}  ${gfx.width}×${gfx.height}`
      : '클릭 또는 터치로 시작';
    input.endFrame();
  });
}
