import * as THREE from 'three';
import { createPhysics } from '../core/physics';
import { IDLE_INPUT, Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';
import { RetroPipeline } from '../render/retro';
import { GameWorld } from '../world/GameWorld';
import { MobManager } from '../mobs/MobManager';
import { VISUAL, PERF } from '../config/settings';
import { TUNING } from '../config/tuning';
import { createOverlays } from '../ui/overlays';
import { showEndScreen } from '../ui/EndScreen';
import { showSelectScreen } from '../ui/SelectScreen';
// import { makeHudText, makeLootText } from '../ui/hud'; // T9 에서 사용
import { Inventory } from './inventory';
import {
  SAVE_KEY, beginRaid, diffMaterials, loadPersistent, repairWeapons, serialize,
  settleDeath, settleExtract, toState, toStored,
} from './persistence';
import { stepExtract } from './extractMath';
import { MomentumLauncher } from '../weapons/MomentumLauncher';
import { EmCoil } from '../weapons/EmCoil';
import { ArcEffects } from '../weapons/ArcEffects';
import type { Weapon } from '../weapons/Weapon';
import { Projectiles } from '../weapons/Projectiles';
import { ViewModel } from '../weapons/ViewModel';
import { createWeaponState, computeStats } from '../data/loadout';
import { BASES } from '../data/bases';
import { loadoutFromUrl } from '../data/startState';
import { PARTS } from '../data/parts';
import type { Persistent } from '../core/types';

/** localStorage 는 사생활 보호 모드/차단 환경에서 throw 할 수 있다 → 실패해도 게임은 동작 (저장만 안 됨) */
const storage = {
  get: () => { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } },
  set: (p: Persistent) => { try { localStorage.setItem(SAVE_KEY, serialize(p)); } catch { /* 저장 불가: 무시 */ } },
};

export async function startRaid(root: HTMLElement) {
  // 장착 메뉴 (메뉴를 선택해야 내용 진행, 콜백이 없으면 버튼 클릭 안 함)
  let menuDone = false;
  let initialLoadout = loadoutFromUrl(location.search);
  showSelectScreen(root, {
    start: (loadout) => { initialLoadout = loadout; menuDone = true; },
  });
  while (!menuDone) await new Promise((r) => setTimeout(r, 100));
  root.innerHTML = ''; // 메뉴 지우기

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

  // --- 영속 데이터: 보관함 → 소지품 (무기 전부 + 재료 키트). 레이드 중 창을 닫으면 다음 로드 때 사망 처리 ---
  let persistent = beginRaid(loadPersistent(storage.get()));
  // 개발용: URL 의 부품 파라미터(?base=&front=&rear=&top=)로 해당 베이스 무기를 새 구성(풀 내구도)으로 교체. 정식 메뉴는 T9
  // initialLoadout 으로 해당 베이스 무기를 새 구성(풀 내구도)으로 교체
  const i = persistent.carried.weapons.findIndex((w) => w.loadout.base === initialLoadout.base);
  if (i >= 0) persistent.carried.weapons[i] = toStored(createWeaponState(initialLoadout));
  storage.set(persistent);
  // 선택한 베이스로 초기 무기 설정
  const startBase = initialLoadout.base;
  const startMaterials = { ...persistent.carried.materials };
  const startedAt = performance.now();

  // 재료 객체를 소지품과 공유 → 사격 소모/전리품 습득이 곧바로 소지품에 반영된다
  const inventory = new Inventory(persistent.carried.materials);
  let mobs: MobManager;
  const projectiles = new Projectiles(scene, world, player.body, () => mobs.targets());
  mobs = new MobManager(scene, world, gameWorld.loot, gameWorld.mobSpawns, PERF.mobCap);
  const view = new ViewModel(camera);
  const arcs = new ArcEffects(scene);

  // --- 소지한 무기들 (WPN 버튼으로 순환 전환, 위치/상태 유지) ---
  const states = persistent.carried.weapons.map(toState);
  const makeWeapon = (i: number): Weapon => states[i].loadout.base === 'em_coil'
    ? new EmCoil(states[i], {
      world, player, view, arcs,
      staticConductors: () => gameWorld.conductors,
      mobTargets: () => mobs.alive,
      isInWater: (x, z) => gameWorld.isInWater(x, z),
    })
    : new MomentumLauncher(states[i], player, projectiles, view, inventory);
  const weapons = states.map((_, i) => makeWeapon(i));

  let cur = Math.max(0, states.findIndex((s) => s.loadout.base === startBase));
  let weapon = weapons[cur];

  const input = new Input(renderer.domElement, root);
  if (import.meta.env.DEV) {
    (window as any).__game = { player, gfx, input, world, weapon, inventory, projectiles, gameWorld, mobs, arcs, scene, camera, states, get persistent() { return persistent; } };
  }
  const overlays = createOverlays(root, () => input.touch.enabled);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;color:#7fbf6a;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);
  let last = performance.now(), frames = 0, accum = 0, cooldown = 3;

  // 피격 연출(임시): 붉은 화면 번쩍임. 정식 HUD 는 T9
  const hitFlash = document.createElement('div');
  hitFlash.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;background:#c0452e;opacity:0';
  root.appendChild(hitFlash);

  // --- 레이드 진행/종료 ---
  let phase: 'raid' | 'extracted' | 'dead' = 'raid';
  let extractProgress = 0;

  function endRaid(outcome: 'extracted' | 'dead') {
    phase = outcome;
    document.exitPointerLock?.();
    const seconds = (performance.now() - startedAt) / 1000;
    let delta: Record<string, number> = {};
    let lost: { weapons: Persistent['carried']['weapons']; materials: Record<string, number> } = { weapons: [], materials: {} };
    if (outcome === 'dead') {
      const r = settleDeath(persistent); // 소지한 무기·재료 손실, 보관함만 유지
      persistent = r.p;
      lost = r.lost;
    } else {
      const r = settleExtract(persistent, states.map(toStored)); // 마모가 반영된 무기와 소지 재료를 보관함으로
      persistent = r.p;
      delta = diffMaterials(startMaterials, r.carriedOut);
    }
    storage.set(persistent);
    showEndScreen(root, { outcome, kills: mobs.kills, seconds, delta, lost, stash: persistent.stash }, {
      restart: () => location.reload(),
      // 자동 수리 버튼(아지트 수리 대체)
      repairAndRestart: () => { storage.set(repairWeapons(persistent)); location.reload(); },
    });
  }

  function exitHud() {
    const e = gameWorld.extraction;
    const dx = e.position.x - player.position.x, dz = e.position.z - player.position.z;
    // 시점 기준 상대 방위 (0 = 정면). yaw 는 -z 방향이 0 이고 왼쪽(+)으로 회전
    const rel = Math.atan2(-dx, -dz) - player.yaw;
    const k = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    const arrow = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'][k];
    const water = gameWorld.isInWater(player.position.x, player.position.z) ? '  [물 위: 누전 위험]' : '';
    const hold = TUNING.raid.extractHold;
    if (extractProgress > 0 && hold > 0) return `탈출 중... ${Math.round((extractProgress / hold) * 100)}%`;
    return `EXIT ${arrow} ${Math.hypot(dx, dz).toFixed(0)}m${water}`;
  }

  function weaponHud() {
    const ws = weapon.state;
    const { inactiveParts } = computeStats(ws);
    const dur = [`${BASES[ws.loadout.base].name} ${Math.ceil(ws.baseDurability)}`];
    for (const id of Object.keys(ws.partDurability)) {
      dur.push(`${PARTS[id].name} ${Math.ceil(ws.partDurability[id])}${inactiveParts.includes(id) ? '(정지)' : ''}`);
    }
    hitFlash.style.opacity = String(Math.max(0, 0.45 - (performance.now() / 1000 - player.lastHitAt)) * 1.2);
    return [
      `HP ${Math.ceil(player.hp)}/${TUNING.player.maxHp}   몹 ${mobs.alive.length}/${mobs.mobs.length}  처치 ${mobs.kills}`,
      `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}  ${gfx.width}x${gfx.height}`,
      `내구도 ${dur.join(' | ')}`,
      ...weapon.hudLines(),
      exitHud(),
    ].join('\n');
  }

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (phase === 'raid') {
      weapon.update(dt, input);
      projectiles.update(dt);
      player.update(dt, input);
      mobs.update(dt, player);
      for (const got of gameWorld.loot.update(dt, player.position)) {
        for (const [id, n] of Object.entries(got)) inventory.materials[id] = (inventory.materials[id] ?? 0) + n;
      }
      // 탈출: 지점 안에서 extractHold 초 버티면 성공. 사망이 우선
      const ex = stepExtract(extractProgress, gameWorld.extraction.contains(player.position), dt, TUNING.raid.extractHold, TUNING.raid.extractDecay);
      extractProgress = ex.progress;
      if (player.dead) endRaid('dead');
      else if (ex.done) endRaid('extracted');
    } else {
      player.update(dt, IDLE_INPUT); // 종료 후에는 조작 불가, 낙하 등 물리만 진행
    }
    arcs.update(dt);
    gameWorld.update(dt);
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

    hud.textContent = phase !== 'raid' ? '' : input.active ? weaponHud() : '클릭 또는 터치로 시작';
    input.endFrame();
  });
}
