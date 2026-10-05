import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning';
import { addItem, countOf, countOfAll, makeGrid, allInstances, findPlaced, placeAt, newInstance } from '../inventory/grid';
import { createItem, repairCost, weaponStats, armorStatsOf, weaponStateOf } from './gear';
import { defaultSave, parseSave, serializeSave, emptyPrep } from './save';
import {
  analyzerTier, attach, beginRaid, busyUids, craft, detach, equipArmor, equipContainer, equipWeapon, nextNodeFor,
  pickUpToBag, remainingMs, repair, resolveJobs, safeBoxRejects, settleDeath, settleExtract, startAnalysis,
  startResearch, unequip, ensureStarterWeapon, analysisStatus, researchStatus,
} from './state';
import { carryGrids, weaponList } from './equip';
import { computeStats } from '../data/loadout';
import { BASES } from '../data/bases';

const T0 = 1_000_000;
const giveStash = (s: ReturnType<typeof defaultSave>, id: string, n = 1) => { const r = addItem(s.stash, createItem(id, n)); expect(r).toBeNull(); };
const find = (s: ReturnType<typeof defaultSave>, defId: string) => allInstances(s.stash).find((i) => i.defId === defId)!;

describe('새 게임', () => {
  it('기초 분석기 1개와 무기·재료를 지급한다', () => {
    const s = defaultSave();
    expect(analyzerTier(s)).toBe(1);
    expect(find(s, 'momentum_launcher')).toBeTruthy();
    expect(countOf(s.stash, 'scrap')).toBe(40);
    expect(s.raid).toBeNull();
  });
  it('격자 크기는 설정값을 따른다', () => {
    const s = defaultSave();
    expect(s.stash).toMatchObject(TUNING.hub.grid.stash);
    expect(s.safe).toMatchObject(TUNING.hub.grid.safe);
  });
});

describe('분석기: 샘플 → 노드 해금 (타임스탬프 기반)', () => {
  it('샘플이 없으면 시작 불가', () => {
    expect(analysisStatus(defaultSave(), 'anomaly_sample').ok).toBe(false);
  });

  it('첫 샘플은 뉴턴 역학을 연다. 시간이 지나야 해금되고 샘플은 소모된다', () => {
    const s = defaultSave();
    giveStash(s, 'anomaly_sample', 2);
    const r = startAnalysis(s, 'anomaly_sample', T0);
    expect(r.ok && r.node.id).toBe('newton');
    expect(countOf(s.stash, 'anomaly_sample')).toBe(1);
    expect(resolveJobs(s, T0 + 1000)).toEqual([]);
    expect(s.nodes.newton).toBeUndefined();
    const dur = s.analysis!.durationMs;
    expect(remainingMs(s.analysis!, T0 + 1000)).toBe(dur - 1000);
    expect(resolveJobs(s, T0 + dur)).toHaveLength(1);
    expect(s.nodes.newton).toBeDefined();
    expect(s.analysis).toBeNull();
  });

  it('저장→불러오기(앱 재시작) 후에도 같은 타임스탬프로 진행된다', () => {
    const s = defaultSave();
    giveStash(s, 'anomaly_sample');
    startAnalysis(s, 'anomaly_sample', T0);
    const dur = s.analysis!.durationMs;
    const loaded = parseSave(serializeSave(s));
    expect(remainingMs(loaded.analysis!, T0 + 5000)).toBe(dur - 5000);
    resolveJobs(loaded, T0 + dur + 99999); // 한참 뒤에 켰다
    expect(loaded.nodes.newton).toBeDefined();
  });

  it('분석 중에는 두 번째 분석 불가, 시계가 거꾸로 가도 남은 시간이 전체를 넘지 않는다', () => {
    const s = defaultSave();
    giveStash(s, 'anomaly_sample', 2);
    startAnalysis(s, 'anomaly_sample', T0);
    expect(startAnalysis(s, 'anomaly_sample', T0).ok).toBe(false);
    expect(remainingMs(s.analysis!, T0 - 50_000)).toBe(s.analysis!.durationMs);
  });

  it('해금 순서는 뉴턴→에너지→전자기→상대론→양자, 상위 노드는 상위 분석기가 필요', () => {
    const s = defaultSave();
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      const n = nextNodeFor(s, 'anomaly_sample');
      if (!n) break;
      order.push(n.id);
      s.nodes[n.id] = T0;
    }
    expect(order).toEqual(['newton', 'energy', 'em', 'relativity', 'quantum']);

    const s2 = defaultSave();
    s2.nodes.newton = T0;
    giveStash(s2, 'anomaly_sample');
    const st = analysisStatus(s2, 'anomaly_sample'); // 에너지 보존: 2단계 필요, 보유 1단계
    expect(st.ok).toBe(false);
    giveStash(s2, 'analyzer_2');
    expect(analysisStatus(s2, 'anomaly_sample').ok).toBe(true);
  });

  it('창고 밖(안전 보관함)의 샘플도 쓸 수 있다', () => {
    const s = defaultSave();
    addItem(s.safe, createItem('anomaly_sample'));
    expect(startAnalysis(s, 'anomaly_sample', T0).ok).toBe(true);
    expect(countOf(s.safe, 'anomaly_sample')).toBe(0);
  });
});

describe('연구대: 개량', () => {
  const setup = () => {
    const s = defaultSave();
    s.nodes.newton = T0;
    giveStash(s, 'spring_steel', 5);
    return s;
  };

  it('잠긴 노드의 개량은 불가', () => {
    const s = defaultSave();
    const w = find(s, 'momentum_launcher');
    expect(researchStatus(s, w.uid, 'launcher_barrel').ok).toBe(false);
    expect(researchStatus(s, w.uid, 'coil_winding').ok).toBe(false);
  });

  it('재료를 소모하고, 시간이 지나면 레벨이 오르며 스탯이 바뀐다(장단점)', () => {
    const s = setup();
    const w = find(s, 'momentum_launcher');
    const before = weaponStats(w).stats;
    const scrapBefore = countOf(s.stash, 'scrap');
    expect(startResearch(s, w.uid, 'launcher_barrel', T0).ok).toBe(true);
    expect(countOf(s.stash, 'scrap')).toBe(scrapBefore - 8);
    expect(busyUids(s).has(w.uid)).toBe(true);
    expect(startResearch(s, w.uid, 'launcher_hardening', T0).ok).toBe(false); // 동시 연구 불가
    resolveJobs(s, T0 + s.research!.durationMs);
    expect(w.lv?.launcher_barrel).toBe(1);
    const after = weaponStats(w).stats;
    expect(after.projectileSpeed).toBeCloseTo(before.projectileSpeed * 1.08);
    expect(after.recoil).toBeCloseTo(before.recoil * 1.07);
    expect(s.research).toBeNull();
  });

  it('최대 레벨을 넘길 수 없다', () => {
    const s = setup();
    const w = find(s, 'momentum_launcher');
    w.lv = { launcher_barrel: 3 };
    expect(researchStatus(s, w.uid, 'launcher_barrel').ok).toBe(false);
  });

  it('베이스 개량은 장착한 부품 개량과 함께 합산되고, 파손된 부품의 개량은 빠진다', () => {
    const w = createItem('momentum_launcher');
    const part = createItem('damping_spring');
    part.lv = { spring_tuning: 2 };
    w.parts = { rear: part };
    const bare = computeStats(weaponStateOf(createItem('momentum_launcher'))).stats;
    const withPart = weaponStats(w).stats;
    expect(withPart.recoil).toBeCloseTo(bare.recoil * 0.6 * 0.9 * 0.9);
    part.dur = 0;
    expect(weaponStats(w).stats.recoil).toBeCloseTo(bare.recoil); // 부품 정지 → 효과·개량 모두 정지
  });

  it('방어구 개량: 충격↑ 속도↓', () => {
    const v = createItem('plate_vest');
    const b = armorStatsOf(v);
    v.lv = { armor_plating: 2 };
    const a = armorStatsOf(v);
    expect(a.resist.impact).toBeCloseTo(b.resist.impact + 0.1);
    expect(a.speedMul).toBeCloseTo(b.speedMul - 0.06);
  });

  it('연구 대상이 사라지면 연구는 중단 알림만 남는다', () => {
    const s = setup();
    const w = find(s, 'momentum_launcher');
    startResearch(s, w.uid, 'launcher_barrel', T0);
    s.stash.placed = s.stash.placed.filter((p) => p.inst.uid !== w.uid);
    const msgs = resolveJobs(s, T0 + s.research!.durationMs);
    expect(msgs[0]).toContain('연구 중단');
  });
});

describe('작업대', () => {
  it('기초 레시피는 처음부터, 노드 레시피는 해금 후', () => {
    const s = defaultSave();
    expect(craft(s, 'r_handle').ok).toBe(true);
    expect(find(s, 'handle')).toBeTruthy();
    expect(craft(s, 'r_launcher').ok).toBe(false);
    s.nodes.newton = T0;
    giveStash(s, 'spring_steel', 2);
    expect(craft(s, 'r_launcher').ok).toBe(true);
  });

  it('재료 부족이면 제작 실패, 아무것도 소모되지 않는다', () => {
    const s = defaultSave();
    const before = countOf(s.stash, 'scrap');
    s.stash.placed = s.stash.placed.filter((p) => p.inst.defId !== 'copper_wire');
    expect(craft(s, 'r_scope').ok).toBe(false);
    expect(countOf(s.stash, 'scrap')).toBe(before);
  });

  it('창고에 자리가 없으면 제작이 취소되고 재료도 그대로', () => {
    const s = defaultSave();
    s.stash = makeGrid(1, 1);
    addItem(s.stash, createItem('scrap', 20));
    s.stash.placed[0].inst.count = 20;
    // 고철 20 으로 만드는 레시피는 없으므로 r_shin_guard(고철 8, 2×2)를 쓴다. 결과물이 안 들어간다
    const r = craft(s, 'r_shin_guard');
    expect(r.ok).toBe(false);
    expect(countOf(s.stash, 'scrap')).toBe(20);
  });

  it('부품 장착/교체/분리', () => {
    const s = defaultSave();
    giveStash(s, 'handle');
    giveStash(s, 'scope');
    const w = find(s, 'momentum_launcher');
    expect(attach(s, w.uid, find(s, 'handle').uid).ok).toBe(true);
    expect(w.parts?.rear?.defId).toBe('handle');
    expect(allInstances(s.stash).some((i) => i.defId === 'handle')).toBe(false);
    giveStash(s, 'damping_spring');
    expect(attach(s, w.uid, find(s, 'damping_spring').uid).ok).toBe(true); // 후방 슬롯 교체
    expect(w.parts?.rear?.defId).toBe('damping_spring');
    expect(find(s, 'handle')).toBeTruthy(); // 교체된 부품은 창고로
    expect(detach(s, w.uid, 'rear').ok).toBe(true);
    expect(w.parts?.rear).toBeUndefined();
  });

  it('호환되지 않는 부품은 장착 불가', () => {
    const s = defaultSave();
    giveStash(s, 'focus_coil'); // 전자기 코일 전용
    const w = find(s, 'momentum_launcher');
    const r = attach(s, w.uid, find(s, 'focus_coil').uid);
    expect(r.ok).toBe(false);
    expect(w.parts).toBeUndefined();
  });

  it('수리: 내구도 0 도 작업대에서 복구, 비용은 부족분 비례(+파손 추가 재료)', () => {
    const s = defaultSave();
    const w = find(s, 'momentum_launcher');
    expect(repair(s, w.uid).ok).toBe(false); // 멀쩡함
    w.dur = 100;
    const c1 = repairCost(w)!;
    expect(c1.scrap).toBe(Math.ceil(100 / TUNING.hub.repair.durPerScrap));
    expect(c1.ingot).toBeUndefined();
    w.dur = 0;
    const c0 = repairCost(w)!;
    expect(c0.ingot).toBe(1);
    expect(repair(s, w.uid).ok).toBe(true);
    expect(w.dur).toBe(BASES.momentum_launcher.maxDurability);
  });

  it('재료가 부족하면 수리 불가', () => {
    const s = defaultSave();
    s.stash.placed = s.stash.placed.filter((p) => p.inst.defId !== 'scrap');
    const w = find(s, 'momentum_launcher');
    w.dur = 10;
    expect(repair(s, w.uid).ok).toBe(false);
  });
});

describe('출격 준비 → 레이드', () => {
  const ready = () => {
    const s = defaultSave();
    expect(equipWeapon(s, find(s, 'momentum_launcher').uid).ok).toBe(true);
    return s;
  };

  it('무기 없이는 출격 불가', () => {
    expect(beginRaid(defaultSave(), T0).ok).toBe(false);
  });

  it('무기 칸: 주무기 2 · 보조 1 · 근접 1, 분류가 맞는 칸에만 들어간다', () => {
    const s = defaultSave();
    for (let i = 0; i < 3; i++) giveStash(s, 'em_coil'); // 주무기 3개 중 2개만 장착
    giveStash(s, 'pocket_launcher');
    giveStash(s, 'impact_blade');
    let primaries = 0;
    for (const w of allInstances(s.stash).filter((i) => i.defId === 'em_coil')) if (equipWeapon(s, w.uid).ok) primaries++;
    expect(primaries).toBe(2);
    expect(equipWeapon(s, find(s, 'momentum_launcher').uid).ok).toBe(false); // 주무기 칸이 가득
    expect(equipWeapon(s, find(s, 'pocket_launcher').uid).ok).toBe(true);
    expect(s.prep.weapons.secondary?.defId).toBe('pocket_launcher');
    expect(equipWeapon(s, find(s, 'impact_blade').uid).ok).toBe(true);
    expect(s.prep.weapons.melee?.defId).toBe('impact_blade');
    expect(weaponList(s.prep).map((w) => w.defId)).toEqual(['em_coil', 'em_coil', 'pocket_launcher', 'impact_blade']); // 칸 순서
  });

  it('헬멧과 방어구는 별개 칸, 조끼·가방은 장착하면 그 크기의 격자가 생긴다', () => {
    const s = defaultSave();
    expect(equipArmor(s, find(s, 'scrap_helmet').uid).ok).toBe(true);
    expect(equipArmor(s, find(s, 'scrap_vest').uid).ok).toBe(true);
    expect(s.prep.armor.helmet?.defId).toBe('scrap_helmet');
    expect(s.prep.armor.body?.defId).toBe('scrap_vest');
    expect(s.prep.carry.vest).toBeNull();
    expect(equipContainer(s, find(s, 'scrap_rig').uid).ok).toBe(true);
    expect(equipContainer(s, find(s, 'canvas_backpack').uid).ok).toBe(true);
    expect(s.prep.carry.vest).toMatchObject({ w: 4, h: 2 });
    expect(s.prep.carry.backpack).toMatchObject({ w: 6, h: 4 });
    expect(carryGrids(s.prep.carry)).toHaveLength(3); // 주머니 + 조끼 + 가방
  });

  it('내용물이 있는 조끼·가방은 벗거나 교체할 수 없다', () => {
    const s = defaultSave();
    equipContainer(s, find(s, 'canvas_backpack').uid);
    addItem(s.prep.carry.backpack!, createItem('scrap', 5));
    expect(unequip(s, { container: 'backpack' }).ok).toBe(false);
    giveStash(s, 'field_pack');
    expect(equipContainer(s, find(s, 'field_pack').uid).ok).toBe(false);
    s.prep.carry.backpack!.placed = [];
    expect(equipContainer(s, find(s, 'field_pack').uid).ok).toBe(true); // 비우면 교체
    expect(s.prep.carry.backpack).toMatchObject({ w: 8, h: 6 });
    expect(find(s, 'canvas_backpack')).toBeTruthy(); // 이전 가방은 창고로
  });

  it('출격하면 조끼·가방 격자도 레이드로 가고, 사망하면 내용물과 함께 사라진다', () => {
    const s = defaultSave();
    equipWeapon(s, find(s, 'momentum_launcher').uid);
    equipContainer(s, find(s, 'canvas_backpack').uid);
    addItem(s.prep.carry.backpack!, createItem('scrap', 12));
    beginRaid(s, T0);
    expect(s.raid!.carry.backpack).not.toBeNull();
    expect(countOfAll(carryGrids(s.raid!.carry), 'scrap')).toBeGreaterThanOrEqual(12);
    const rep = settleDeath(s);
    expect(rep.lost.some((i) => i.defId === 'canvas_backpack')).toBe(true);
    expect(find(s, 'canvas_backpack')).toBeUndefined();
  });

  it('방어구는 슬롯별로 하나, 교체 시 이전 것이 창고로', () => {
    const s = defaultSave();
    giveStash(s, 'plate_vest');
    expect(equipArmor(s, find(s, 'scrap_vest').uid).ok).toBe(true);
    expect(equipArmor(s, find(s, 'plate_vest').uid).ok).toBe(true);
    expect(s.prep.armor.body?.defId).toBe('plate_vest');
    expect(find(s, 'scrap_vest')).toBeTruthy();
    expect(unequip(s, { armor: 'body' }).ok).toBe(true);
    expect(s.prep.armor.body).toBeUndefined();
  });

  it('출격하면 prep 이 비고 raid 가 생긴다. 탄이 부족하면 보급 재료가 가방에 들어간다', () => {
    const s = ready();
    expect(beginRaid(s, T0).ok).toBe(true);
    expect(weaponList(s.prep)).toHaveLength(0);
    expect(weaponList(s.raid!)).toHaveLength(1);
    expect(countOf(s.raid!.carry.pockets, TUNING.raid.rationMaterial)).toBe(TUNING.raid.minKitTotal);
    expect(beginRaid(s, T0).ok).toBe(false);
  });

  it('연구 중인 무기는 장착할 수 없다', () => {
    const s = defaultSave();
    s.nodes.newton = T0;
    giveStash(s, 'spring_steel', 2);
    const w = find(s, 'momentum_launcher');
    startResearch(s, w.uid, 'launcher_barrel', T0);
    expect(equipWeapon(s, w.uid).ok).toBe(false);
  });
});

describe('탈출/사망 정산', () => {
  const raidWith = () => {
    const s = defaultSave();
    equipWeapon(s, find(s, 'momentum_launcher').uid);
    equipArmor(s, find(s, 'scrap_vest').uid);
    addItem(s.prep.carry.pockets, createItem('scrap', 10)); // 들고 들어간 재료
    beginRaid(s, T0);
    return s;
  };

  it('탈출 성공: 가방·무기·방어구·안전 보관함이 창고로, found 표시는 사라진다', () => {
    const s = raidWith();
    expect(pickUpToBag(carryGrids(s.raid!.carry), 'anomaly_sample', 1)).toBe(true);
    // 획득한 샘플을 안전 보관함으로
    const sample = allInstances(s.raid!.carry.pockets).find((i) => i.defId === 'anomaly_sample')!;
    expect(safeBoxRejects(sample)).toBeNull();
    s.raid!.carry.pockets.placed = s.raid!.carry.pockets.placed.filter((p) => p.inst !== sample);
    addItem(s.safe, sample);
    pickUpToBag(carryGrids(s.raid!.carry), 'copper_wire', 3);
    const rep = settleExtract(s);
    expect(s.raid).toBeNull();
    expect(rep.overflow).toBe(0);
    expect(countOf(s.stash, 'anomaly_sample')).toBe(1);
    expect(countOf(s.stash, 'copper_wire')).toBe(6 + 3);
    expect(find(s, 'momentum_launcher')).toBeTruthy();
    expect(find(s, 'scrap_vest')).toBeTruthy();
    expect(allInstances(s.stash).some((i) => i.found)).toBe(false);
    expect(s.safe.placed).toHaveLength(0);
    expect(s.stats.extracts).toBe(1);
  });

  it('사망: 가방·장착 장비 손실, 안전 보관함은 유지', () => {
    const s = raidWith();
    pickUpToBag(carryGrids(s.raid!.carry), 'anomaly_sample', 1);
    const sample = allInstances(s.raid!.carry.pockets).find((i) => i.defId === 'anomaly_sample')!;
    s.raid!.carry.pockets.placed = s.raid!.carry.pockets.placed.filter((p) => p.inst !== sample);
    addItem(s.safe, sample);
    pickUpToBag(carryGrids(s.raid!.carry), 'magnet_chip', 2);
    const scrapBefore = countOf(s.stash, 'scrap');
    const rep = settleDeath(s);
    expect(s.raid).toBeNull();
    expect(rep.lost.some((i) => i.defId === 'momentum_launcher')).toBe(true);
    expect(rep.lost.some((i) => i.defId === 'magnet_chip')).toBe(true);
    expect(countOf(s.safe, 'anomaly_sample')).toBe(1);
    expect(countOf(s.stash, 'magnet_chip')).toBe(0);
    expect(countOf(s.stash, 'scrap')).toBe(scrapBefore); // 창고는 그대로
    expect(allInstances(s.safe).every((i) => !i.found)).toBe(true);
    expect(s.stats.deaths).toBe(1);
  });

  it('사망으로 무기를 전부 잃으면 보급 무기를 지급한다', () => {
    const s = defaultSave();
    s.stash.placed = s.stash.placed.filter((p) => p.inst.defId !== 'momentum_launcher');
    equipWeapon(s, addAndGet(s, 'em_coil'));
    beginRaid(s, T0);
    expect(allInstances(s.stash).some((i) => i.defId.includes('launcher') || i.defId === 'em_coil')).toBe(false);
    settleDeath(s);
    expect(find(s, 'momentum_launcher')).toBeTruthy();
    expect(ensureStarterWeapon(s)).toBe(false); // 이미 있으면 추가 지급 없음
  });

  it('출격 직후(무기가 모두 레이드에 있는 동안)에는 보급 무기가 생기지 않는다', () => {
    const s = defaultSave();
    equipWeapon(s, find(s, 'momentum_launcher').uid);
    beginRaid(s, T0);
    expect(ensureStarterWeapon(s)).toBe(false);
    expect(allInstances(s.stash).some((i) => i.defId === 'momentum_launcher')).toBe(false);
  });

  it('창고가 가득 차면 못 들어간 아이템은 pending 으로 간다', () => {
    const s = raidWith();
    s.stash = makeGrid(3, 3); // 거의 꽉 찬 창고
    for (let i = 0; i < 9; i++) placeAt(s.stash, newInstance('slag', 1), i % 3, Math.floor(i / 3), false);
    pickUpToBag(carryGrids(s.raid!.carry), 'copper_wire', 3);
    const rep = settleExtract(s);
    expect(rep.overflow).toBeGreaterThan(0);
    expect(s.pending.placed.length).toBeGreaterThan(0);
    expect(s.raid).toBeNull();
  });

  it('가방이 가득 차면 획득이 거부되고 가방은 변하지 않는다', () => {
    const s = raidWith();
    const bag = s.raid!.carry.pockets;
    while (!addItem(bag, createItem('em_coil'))) { /* 가득 찰 때까지 */ }
    bag.placed.pop(); // 마지막 부분 추가분 정리
    while (!addItem(bag, createItem('slag', 30))) { /* 틈 메우기 */ }
    const snap = JSON.stringify(bag.placed);
    expect(pickUpToBag([bag], 'magnet_chip', 1)).toBe(false);
    expect(JSON.stringify(bag.placed)).toBe(snap);
  });

  it('안전 보관함은 들고 들어간 아이템(found 아님)을 거부한다', () => {
    expect(safeBoxRejects(createItem('scrap'))).not.toBeNull();
    expect(safeBoxRejects(createItem('scrap', 1, { found: true }))).toBeNull();
  });
});

function addAndGet(s: ReturnType<typeof defaultSave>, id: string): string {
  const it = createItem(id);
  addItem(s.stash, it);
  return it.uid;
}

describe('저장/불러오기', () => {
  it('왕복해도 같다', () => {
    const s = defaultSave();
    s.nodes.newton = 5;
    const l = parseSave(serializeSave(s));
    expect(l).toEqual(s);
  });

  it('손상된 JSON, 다른 버전은 새 게임', () => {
    expect(parseSave('{{{').stash.placed.length).toBeGreaterThan(0);
    expect(parseSave(JSON.stringify({ v: 1 })).v).toBe(2);
    expect(parseSave(null).v).toBe(2);
  });

  it('알 수 없는 아이템·노드는 버리고 나머지는 살린다', () => {
    const s = defaultSave();
    const raw = JSON.parse(serializeSave(s));
    raw.stash.placed.push({ inst: { uid: 'zzz', defId: 'removed_item', count: 1 }, x: 9, y: 15, rot: false });
    raw.nodes = { newton: 1, ghost: 2 };
    raw.analysis = { nodeId: 'ghost', startedAt: 1, durationMs: 5 };
    const l = parseSave(JSON.stringify(raw));
    expect(l.stash.placed).toHaveLength(s.stash.placed.length);
    expect(Object.keys(l.nodes)).toEqual(['newton']);
    expect(l.analysis).toBeNull();
  });

  it('격자 크기 설정이 바뀌어도 아이템을 잃지 않는다(넘치면 입고 대기)', () => {
    const s = defaultSave();
    const raw = JSON.parse(serializeSave(s));
    // 저장 당시보다 작은 격자가 설정된 상황: 범위 밖 위치의 아이템을 만든다
    raw.stash.placed.push({ inst: { uid: 'out1', defId: 'em_coil', count: 1, dur: 200 }, x: 50, y: 50, rot: false });
    const l = parseSave(JSON.stringify(raw));
    const has = (g: typeof l.stash) => g.placed.some((p) => p.inst.uid === 'out1');
    expect(has(l.stash) || has(l.pending)).toBe(true);
  });

  it('레이드 중 저장은 raid 가 남아 로드된다 (호출측이 사망 처리)', () => {
    const s = defaultSave();
    equipWeapon(s, find(s, 'momentum_launcher').uid);
    beginRaid(s, T0);
    const l = parseSave(serializeSave(s));
    expect(l.raid).not.toBeNull();
    settleDeath(l);
    expect(l.raid).toBeNull();
  });

  it('잘못된 prep/raid 구조여도 크래시하지 않는다', () => {
    const l = parseSave(JSON.stringify({ v: 2, prep: 5, raid: { bag: 3, weapons: 'x' }, stash: null }));
    expect(weaponList(l.prep)).toEqual([]);
    expect(emptyPrep().carry.pockets.w).toBe(l.prep.carry.pockets.w);
    expect(findPlaced(l.stash, 'x')).toBeUndefined();
  });
});
