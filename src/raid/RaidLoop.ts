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
import { openBagOverlay } from '../ui/BagOverlay';
import { Inventory } from './inventory';
import { stepExtract } from './extractMath';
import { MomentumLauncher } from '../weapons/MomentumLauncher';
import { EmCoil } from '../weapons/EmCoil';
import { PlaceholderWeapon } from '../weapons/PlaceholderWeapon';
import { MeleeBlade } from '../weapons/MeleeBlade';
import { armorList, carryGrids, weaponList } from '../hub/equip';
import { ArcEffects } from '../weapons/ArcEffects';
import type { Weapon } from '../weapons/Weapon';
import { Projectiles } from '../weapons/Projectiles';
import { ViewModel } from '../weapons/ViewModel';
import { computeStats } from '../data/loadout';
import { BASES } from '../data/bases';
import { ITEMS } from '../data/items';
import { PARTS } from '../data/parts';
import { createArmorSystem } from '../player/armor';
import { weaponStateOf, writeBackWeapon } from '../hub/gear';
import { canAddAll, pickUpToBag, settleDeath, settleExtract } from '../hub/state';
import { storage } from '../hub/storage';
import type { HubSave } from '../hub/save';
import { usedCells } from '../inventory/grid';

/**
 * 레이드 시작. save.raid(출격 준비에서 만든 가방·무기·방어구)를 받아 진행하고, 끝나면 정산(settleExtract/settleDeath) 후 저장한다.
 * persist=false 는 개발용 빠른 시작(저장을 건드리지 않음).
 */
export async function startRaid(root: HTMLElement, save: HubSave, opts: { persist?: boolean } = {}) {
  const persist = opts.persist ?? true;
  const session = save.raid!;
  const saveNow = () => { if (persist) storage.save(save); };

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

  // --- 출격 준비의 방어구(저항·속도 페널티) ---
  const armorPieces = () => armorList(session);
  if (armorPieces().length) player.armor = createArmorSystem(armorPieces);

  // 가방 격자를 탄 인벤토리로 직접 쓴다 → 사격 소모/전리품 습득이 곧바로 격자에 반영된다
  const carry = carryGrids(session.carry);
  const inventory = new Inventory(carry);
  const startedAt = performance.now();
  let mobs: MobManager;
  const projectiles = new Projectiles(scene, world, player.body, () => mobs.targets());
  mobs = new MobManager(scene, world, gameWorld.loot, gameWorld.mobSpawns, PERF.mobCap);
  const view = new ViewModel(camera);
  const arcs = new ArcEffects(scene);

  // --- 장착한 무기들 (WPN 버튼/F 키로 순환 전환) ---
  const weaponInsts = weaponList(session);
  const states = weaponInsts.map((w) => weaponStateOf(w));
  const makeWeapon = (i: number): Weapon => {
    const base = states[i].loadout.base;
    if (!BASES[base].implemented) return new PlaceholderWeapon(states[i]);
    if (base === 'impact_blade') return new MeleeBlade(states[i], player, view, () => mobs.targets());
    return base === 'em_coil'
      ? new EmCoil(states[i], {
        world, player, view, arcs,
        staticConductors: () => gameWorld.conductors,
        mobTargets: () => mobs.alive,
        isInWater: (x, z) => gameWorld.isInWater(x, z),
      })
      : new MomentumLauncher(states[i], player, projectiles, view, inventory);
  };
  const weapons = states.map((_, i) => makeWeapon(i));
  let cur = 0;
  let weapon = weapons[cur];

  const input = new Input(renderer.domElement, root);
  if (import.meta.env.DEV) {
    (window as any).__game = { player, gfx, input, world, get weapon() { return weapon; }, inventory, projectiles, gameWorld, mobs, arcs, scene, camera, states, save, session };
  }

  const carrySections = () => [
    { id: 'pockets', title: '주머니', grid: session.carry.pockets },
    ...(session.carry.vest ? [{ id: 'vest', title: '조끼', grid: session.carry.vest }] : []),
    ...(session.carry.backpack ? [{ id: 'backpack', title: '가방', grid: session.carry.backpack }] : []),
  ];

  // --- 가방 화면(안전 보관함 이동): 열려 있는 동안 레이드 일시정지 ---
  let bagOpen = false;
  function openBag() {
    if (bagOpen || phase !== 'raid') return;
    bagOpen = true;
    document.exitPointerLock?.();
    openBagOverlay(root, carrySections(), save.safe, saveNow, () => { bagOpen = false; input.endFrame(); last = performance.now(); });
  }
  const overlays = createOverlays(root, () => input.touch.enabled, () => input.touch.toggleDebug(), openBag);

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
  let hudMsg = '', hudMsgUntil = 0;
  const say = (t: string) => { hudMsg = t; hudMsgUntil = performance.now() + 2200; };

  function endRaid(outcome: 'extracted' | 'dead') {
    phase = outcome;
    document.exitPointerLock?.();
    const seconds = (performance.now() - startedAt) / 1000;
    // 레이드 중 마모를 아이템에 반영한 뒤 정산한다 (사망이면 어차피 손실)
    weaponInsts.forEach((w, i) => writeBackWeapon(w, states[i]));
    let gained: Record<string, number> = {}, overflow = 0, lost: ReturnType<typeof settleDeath>['lost'] = [];
    if (outcome === 'dead') lost = settleDeath(save).lost; // 가방·장착 장비 손실, 안전 보관함 유지
    else { const r = settleExtract(save); gained = r.gained; overflow = r.overflow; } // 가방·장비·안전 보관함 → 창고(초과분은 입고 대기)
    saveNow();
    showEndScreen(root, { outcome, kills: mobs.kills, seconds, gained, overflow, lost, keptSafe: save.safe.placed.length }, {
      toHub: () => location.reload(),
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
    const armor = armorPieces().map((a) => `${ITEMS[a.defId].name} ${Math.ceil(a.dur ?? 0)}`).join(' | ');
    for (const id of Object.keys(ws.partDurability)) {
      dur.push(`${PARTS[id].name} ${Math.ceil(ws.partDurability[id])}${inactiveParts.includes(id) ? '(정지)' : ''}`);
    }
    hitFlash.style.opacity = String(Math.max(0, 0.45 - (performance.now() / 1000 - player.lastHitAt)) * 1.2);
    return [
      `HP ${Math.ceil(player.hp)}/${TUNING.player.maxHp}   몹 ${mobs.alive.length}/${mobs.mobs.length}  처치 ${mobs.kills}`,
      `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}  ${gfx.width}x${gfx.height}`,
      `내구도 ${dur.join(' | ')}${armor ? `   방어구 ${armor}` : ''}`,
      `무기 ${cur + 1}/${weapons.length}${weapons.length > 1 ? ' (F/WPN 전환)' : ''}   가방 ${carry.reduce((n, g) => n + usedCells(g), 0)}/${carry.reduce((n, g) => n + g.w * g.h, 0)}칸 (B/BAG)${hudMsgUntil > performance.now() ? `   ${hudMsg}` : ''}`,
      ...weapon.hudLines(),
      exitHud(),
    ].join('\n');
  }

  // 가방에 전부 들어갈 자리가 있을 때만 줍는다 (부분 습득 없음)
  const canPick = (items: Record<string, number>) => canAddAll(carry, items);

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (bagOpen) { gfx.render(scene, camera, now / 1000); input.endFrame(); return; }
    if (phase === 'raid') {
      if (input.justPressed('KeyB')) openBag();
      if (weapons.length > 1 && input.weaponPressed) {
        states[cur].charge = 0;
        player.speedMul = 1; // 코일 충전 중 전환해도 감속이 남지 않게
        cur = (cur + 1) % weapons.length;
        weapon = weapons[cur];
        say(`무기 전환: ${BASES[states[cur].loadout.base].name}`);
      }
      weapon.update(dt, input);
      projectiles.update(dt);
      player.update(dt, input);
      mobs.update(dt, player);
      const { picked, blocked } = gameWorld.loot.update(dt, player.position, canPick);
      for (const got of picked) {
        for (const [id, n] of Object.entries(got)) pickUpToBag(carry, id, n);
        say(`+ ${Object.entries(got).map(([id, n]) => `${ITEMS[id]?.name ?? id}${n > 1 ? ` ${n}` : ''}`).join(', ')}`);
      }
      if (blocked) say('가방이 가득 참 (B 로 정리)');
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
