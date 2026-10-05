import * as THREE from 'three';
import { createPhysics } from '../core/physics';
import { Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';
import { RetroPipeline } from '../render/retro';
import { GameWorld } from '../world/GameWorld';
import { MobManager } from '../mobs/MobManager';
import { VISUAL, PERF } from '../config/settings';
import { TUNING } from '../config/tuning';
import { createOverlays } from '../ui/overlays';
import { Inventory } from './inventory';
import { MomentumLauncher } from '../weapons/MomentumLauncher';
import { Projectiles } from '../weapons/Projectiles';
import { ViewModel } from '../weapons/ViewModel';
import { createWeaponState, computeStats } from '../data/loadout';
import { loadoutFromUrl, START_MATERIALS } from '../data/startState';
import { MATERIALS } from '../data/materials';
import { BASES } from '../data/bases';
import { PARTS } from '../data/parts';

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

  const gameWorld = new GameWorld(scene, world);

  const player = new PlayerController(world, camera, gameWorld.spawn.clone());
  scene.add(camera); // 뷰모델이 카메라 자식이므로 씬에 포함

  // 무기: 개발 중에는 URL 파라미터로 장착 상태 선택 (?base=&front=&rear=&top=). 메뉴는 T9
  const inventory = new Inventory({ ...START_MATERIALS });
  let mobs: MobManager;
  const projectiles = new Projectiles(scene, world, player.body, () => mobs.targets());
  mobs = new MobManager(scene, world, gameWorld.loot, gameWorld.mobSpawns, PERF.mobCap);
  const weaponState = createWeaponState(loadoutFromUrl(location.search));
  const launcher = new MomentumLauncher(weaponState, player, projectiles, new ViewModel(camera), inventory);
  if (import.meta.env.DEV) (window as any).__game = { player, gfx, input: null, world, launcher, inventory, projectiles, gameWorld, mobs };

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;color:#7fbf6a;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);

  const input = new Input(renderer.domElement, root);
  if (import.meta.env.DEV) (window as any).__game.input = input;

  const overlays = createOverlays(root, () => input.touch.enabled);
  let last = performance.now(), frames = 0, accum = 0, cooldown = 3;

  // 피격 연출(임시): 붉은 화면 번쩍임. 정식 HUD 는 T9
  const hitFlash = document.createElement('div');
  hitFlash.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;background:#c0452e;opacity:0';
  root.appendChild(hitFlash);

  function exitHud() {
    const e = gameWorld.extraction;
    const dx = e.position.x - player.position.x, dz = e.position.z - player.position.z;
    // 시점 기준 상대 방위 (0 = 정면). yaw 는 -z 방향이 0 이고 왼쪽(+)으로 회전
    const rel = Math.atan2(-dx, -dz) - player.yaw;
    const k = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    const arrow = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'][k];
    const water = gameWorld.isInWater(player.position.x, player.position.z) ? '  [물 위: 누전 위험]' : '';
    return e.contains(player.position)
      ? 'EXIT 도달! (결과 처리는 T8)'
      : `EXIT ${arrow} ${Math.hypot(dx, dz).toFixed(0)}m${water}`;
  }

  function weaponHud() {
    const ws = launcher.state;
    const { stats, inactiveParts } = computeStats(ws);
    const mat = MATERIALS[inventory.selected];
    const dur = [`${BASES[ws.loadout.base].name} ${Math.ceil(ws.baseDurability)}`];
    for (const id of Object.keys(ws.partDurability)) {
      dur.push(`${PARTS[id].name} ${Math.ceil(ws.partDurability[id])}${inactiveParts.includes(id) ? '(정지)' : ''}`);
    }
    hitFlash.style.opacity = String(Math.max(0, 0.45 - (performance.now() / 1000 - player.lastHitAt)) * 1.2);
    return [
      `HP ${Math.ceil(player.hp)}/${TUNING.player.maxHp}${player.dead ? '  DEAD (결과 처리는 T8)' : ''}   몹 ${mobs.alive.length}/${mobs.mobs.length}  처치 ${mobs.kills}`,
      `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}  ${gfx.width}x${gfx.height}`,
      `재료 ${mat.name} (${mat.mass}kg) x${inventory.count()}  [${Object.entries(inventory.materials).map(([k, v]) => `${k}:${v}`).join(' ')}]`,
      `내구도 ${dur.join(' | ')}`,
      `퍼짐 ${(launcher.spread * 57.3).toFixed(1)}deg  반동 Δv ${launcher.lastDeltaV.toFixed(1)} m/s  v0 ${stats.projectileSpeed.toFixed(0)}`,
      exitHud(),
      launcher.status,
    ].join('\n');
  }

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    launcher.update(dt, input);
    projectiles.update(dt);
    player.update(dt, input);
    mobs.update(dt, player);
    gameWorld.update(dt);
    for (const got of gameWorld.loot.update(dt, player.position)) {
      for (const [id, n] of Object.entries(got)) inventory.materials[id] = (inventory.materials[id] ?? 0) + n;
    }
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

    hud.textContent = input.active ? weaponHud() : '클릭 또는 터치로 시작';
    input.endFrame();
  });
}
