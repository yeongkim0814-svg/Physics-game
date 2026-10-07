import { frameDt } from './frameDt';
import * as THREE from 'three';
import { createPhysics } from '../core/physics';
import { Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';
import { createPipeline } from '../render/pipeline';
import { ENV } from '../render/style';
import { BlobShadow } from '../render/blobShadow';
import { GameWorld } from '../world/GameWorld';
import { Throwables } from '../world/Throwables';
import { gameEvents } from '../core/events';
import { MobManager } from '../mobs/MobManager';
import { VISUAL, PERF, DEBUG, UI } from '../config/settings';
import { TUNING } from '../config/tuning';
import { createOverlays } from '../ui/overlays';
import { makeHudText } from '../ui/hud';
import { MomentumLauncher } from '../weapons/MomentumLauncher';
import { EmCoil } from '../weapons/EmCoil';
import { ArcEffects } from '../weapons/ArcEffects';
import type { Weapon } from '../weapons/Weapon';
import { Projectiles } from '../weapons/Projectiles';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { createPlayerCharacter } from '../player/CharacterModel';

/**
 * 오픈월드 샌드박스 시작. 허브 없이 곧바로 3인칭(어깨 너머) 플레이.
 * 무기 2개(운동량 사출기, 전자기 코일)를 F/WPN 으로 전환한다. 사망하면 스폰에서 부활.
 */
export async function startGame(root: HTMLElement) {
  const world = await createPhysics();
  const renderer = new THREE.WebGLRenderer({ antialias: PERF.antialias, powerPreference: 'high-performance' });
  const gfx = createPipeline(renderer);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ENV.fog.color);
  scene.fog = new THREE.Fog(ENV.fog.color, ENV.fog.near, ENV.fog.far);
  const L = ENV.lighting;
  scene.add(new THREE.HemisphereLight(L.sky, L.ground, L.hemiIntensity));
  const sun = new THREE.DirectionalLight(L.sun, L.sunIntensity);
  sun.position.set(...L.sunDir).multiplyScalar(L.sunDistance);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(VISUAL.fov, 16 / 9, VISUAL.camera.near, VISUAL.camera.far);
  addEventListener('resize', () => {
    gfx.setResolution(gfx.defaultHeight(), innerWidth / innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const gameWorld = new GameWorld(scene, world);
  const player = new PlayerController(world, gameWorld.spawn.clone());
  const followCam = new ThirdPersonCamera(camera, world, player);
  const avatar = new PlayerAvatar(scene, player, followCam, createPlayerCharacter());
  avatar.snap();
  const blob = new BlobShadow(scene, world, player.body);

  let mobs: MobManager;
  const projectiles = new Projectiles(scene, world, player.body, () => mobs.targets());
  mobs = new MobManager(scene, world, gameWorld.mobSpawns, PERF.mobCap);
  const arcs = new ArcEffects(scene);
  const throwables = new Throwables(scene, world, avatar);
  if (DEBUG.logThrowables) {
    gameEvents.onLanded.on((st, t, h) => console.log(`[onLanded] kind=${st.kind} id=${st.id} mass=${st.mass} t=${t.toFixed(4)}s drop=${h.toFixed(2)}m`));
  }

  // --- 무기 2개 (WPN 버튼/F 키로 순환 전환) ---
  const weapons: Weapon[] = [
    new MomentumLauncher(player, avatar, projectiles, avatar),
    new EmCoil({
      world, player, aim: avatar, fx: avatar, arcs,
      staticConductors: () => gameWorld.conductors,
      mobTargets: () => mobs.alive,
      isInWater: (x, z) => gameWorld.isInWater(x, z),
    }),
  ];
  let cur = 0;
  let weapon = weapons[cur];

  const input = new Input(renderer.domElement, root);
  if (import.meta.env.DEV) {
    (window as any).__game = { resetAim: () => { aimTimer = 0; player.aiming = false; }, player, avatar, followCam, gfx, input, world, get weapon() { return weapon; }, projectiles, throwables, gameWorld, mobs, arcs, scene, camera };
  }

  const overlays = createOverlays(root, () => input.touch.enabled, () => input.touch.toggleDebug());

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;color:#7fbf6a;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);
  let last = performance.now(), frames = 0, accum = 0, cooldown = 3;

  // 화면 중앙 조준점 (3인칭 조준선: 카메라 중앙 → 목표점)
  const X = UI.crosshair;
  const crosshair = document.createElement('div');
  crosshair.style.cssText = 'position:fixed;left:50%;top:50%;z-index:5;pointer-events:none;transform:translate(-50%,-50%);' +
    `width:${X.size * 2 + X.gap * 2}px;height:${X.size * 2 + X.gap * 2}px`;
  for (const [l, t, w, h] of [
    [0, X.size + X.gap - X.thickness / 2, X.size, X.thickness], [X.size + 2 * X.gap, X.size + X.gap - X.thickness / 2, X.size, X.thickness],
    [X.size + X.gap - X.thickness / 2, 0, X.thickness, X.size], [X.size + X.gap - X.thickness / 2, X.size + 2 * X.gap, X.thickness, X.size],
  ]) {
    const bar = document.createElement('i');
    bar.style.cssText = `position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px;background:${X.color};box-shadow:0 0 0 1px ${X.outline}`;
    crosshair.appendChild(bar);
  }
  root.appendChild(crosshair);

  // 조준 자세 유지 타이머: 발사/던지기 입력 후 aimLingerTime 동안 몸을 카메라 yaw 쪽으로 정렬
  let aimTimer = 0;

  // 피격 연출(임시): 붉은 화면 번쩍임
  const hitFlash = document.createElement('div');
  hitFlash.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;background:#c0452e;opacity:0';
  root.appendChild(hitFlash);

  renderer.setAnimationLoop((now) => {
    const dt = frameDt(now, last, PERF.maxDt);
    last = now;

    if (weapons.length > 1 && input.weaponPressed) {
      weapon.reset();
      player.speedMul = 1; // 코일 충전 중 전환해도 감속이 남지 않게
      cur = (cur + 1) % weapons.length;
      weapon = weapons[cur];
    }
    // 입력 → 조준 자세 → 이동/몸 방향 → 모델·카메라 갱신 → 무기(총구 위치가 이 프레임 자세 기준)
    aimTimer = input.active && (input.fire || input.throwPressed || input.throwHeavyPressed)
      ? TUNING.player.aimLingerTime : Math.max(0, aimTimer - dt);
    player.aiming = aimTimer > 0;
    player.update(dt, input);
    avatar.update(dt);
    weapon.update(dt, input);
    projectiles.update(dt);
    throwables.update(dt, input);
    mobs.update(dt, player);
    if (player.dead) {
      weapon.reset();
      throwables.clear();
      player.respawn(gameWorld.spawn.x, gameWorld.spawn.y, gameWorld.spawn.z);
      aimTimer = 0;
      player.aiming = false;
      avatar.snap(); // 카메라·모델 리셋
    }
    arcs.update(dt);
    gameWorld.update(dt);
    gameWorld.updateSky(camera, dt);
    blob?.update(player.position);
    world.step();
    throwables.afterStep();
    gfx.render(scene, camera, now / 1000);

    frames++;
    accum += dt;
    cooldown -= dt;
    if (accum >= 1) {
      const fps = frames / accum;
      overlays.setFps(fps, gfx.height);
      if (PERF.autoResolution && cooldown <= 0 && fps < PERF.targetFps && gfx.height > gfx.minHeight) {
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
