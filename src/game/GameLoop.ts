import * as THREE from 'three';
import { createPhysics } from '../core/physics';
import { Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';
import { RetroPipeline } from '../render/retro';
import { GameWorld } from '../world/GameWorld';
import { Throwables } from '../world/Throwables';
import { gameEvents } from '../core/events';
import { MobManager } from '../mobs/MobManager';
import { VISUAL, PERF, DEBUG } from '../config/settings';
import { createOverlays } from '../ui/overlays';
import { makeHudText } from '../ui/hud';
import { MomentumLauncher } from '../weapons/MomentumLauncher';
import { EmCoil } from '../weapons/EmCoil';
import { ArcEffects } from '../weapons/ArcEffects';
import type { Weapon } from '../weapons/Weapon';
import { Projectiles } from '../weapons/Projectiles';
import { ViewModel } from '../weapons/ViewModel';

/**
 * 오픈월드 샌드박스 시작. 허브 없이 곧바로 1인칭 플레이.
 * 무기 2개(운동량 사출기, 전자기 코일)를 F/WPN 으로 전환한다. 사망하면 스폰에서 부활.
 */
export async function startGame(root: HTMLElement) {
  const world = await createPhysics();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const gfx = new RetroPipeline(renderer);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VISUAL.fog.color);
  scene.fog = new THREE.Fog(VISUAL.fog.color, VISUAL.fog.near, VISUAL.fog.far);
  const L = VISUAL.lighting;
  scene.add(new THREE.HemisphereLight(L.ambient, 0, L.ambientIntensity));
  const sun = new THREE.DirectionalLight(L.sun, L.sunIntensity);
  sun.position.set(...L.sunDir).multiplyScalar(L.sunDistance);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(VISUAL.fov, 16 / 9, VISUAL.camera.near, VISUAL.camera.far);
  addEventListener('resize', () => {
    gfx.setResolution(VISUAL.internalHeight, innerWidth / innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const gameWorld = new GameWorld(scene, world);
  const player = new PlayerController(world, camera, gameWorld.spawn.clone());
  scene.add(camera); // 뷰모델이 카메라 자식이므로 씬에 포함

  let mobs: MobManager;
  const projectiles = new Projectiles(scene, world, player.body, () => mobs.targets());
  mobs = new MobManager(scene, world, gameWorld.mobSpawns, PERF.mobCap);
  const view = new ViewModel(camera);
  const arcs = new ArcEffects(scene);
  const throwables = new Throwables(scene, world, player);
  if (DEBUG.logThrowables) {
    gameEvents.onLanded.on((st, t, h) => console.log(`[onLanded] kind=${st.kind} id=${st.id} mass=${st.mass} t=${t.toFixed(4)}s drop=${h.toFixed(2)}m`));
  }

  // --- 무기 2개 (WPN 버튼/F 키로 순환 전환) ---
  const weapons: Weapon[] = [
    new MomentumLauncher(player, projectiles, view),
    new EmCoil({
      world, player, view, arcs,
      staticConductors: () => gameWorld.conductors,
      mobTargets: () => mobs.alive,
      isInWater: (x, z) => gameWorld.isInWater(x, z),
    }),
  ];
  let cur = 0;
  let weapon = weapons[cur];

  const input = new Input(renderer.domElement, root);
  if (import.meta.env.DEV) {
    (window as any).__game = { player, gfx, input, world, get weapon() { return weapon; }, projectiles, throwables, gameWorld, mobs, arcs, scene, camera };
  }

  const overlays = createOverlays(root, () => input.touch.enabled, () => input.touch.toggleDebug());

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;color:#7fbf6a;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);
  let last = performance.now(), frames = 0, accum = 0, cooldown = 3;

  // 피격 연출(임시): 붉은 화면 번쩍임
  const hitFlash = document.createElement('div');
  hitFlash.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;background:#c0452e;opacity:0';
  root.appendChild(hitFlash);

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (weapons.length > 1 && input.weaponPressed) {
      weapon.reset();
      player.speedMul = 1; // 코일 충전 중 전환해도 감속이 남지 않게
      cur = (cur + 1) % weapons.length;
      weapon = weapons[cur];
    }
    weapon.update(dt, input);
    projectiles.update(dt);
    throwables.update(dt, input);
    player.update(dt, input);
    mobs.update(dt, player);
    if (player.dead) {
      weapon.reset();
      throwables.clear();
      player.respawn(gameWorld.spawn.x, gameWorld.spawn.y, gameWorld.spawn.z);
    }
    arcs.update(dt);
    gameWorld.update(dt);
    world.step();
    throwables.afterStep();
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

    hitFlash.style.opacity = String(Math.max(0, 0.45 - (performance.now() / 1000 - player.lastHitAt)) * 1.2);
    hud.textContent = input.active
      ? makeHudText(player, weapon, mobs, gameWorld, { slot: cur + 1, slots: weapons.length, fps: `${gfx.width}x${gfx.height}` })
      : '클릭 또는 터치로 시작';
    input.endFrame();
  });
}
