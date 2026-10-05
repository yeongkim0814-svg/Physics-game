import { TUNING } from '../config/tuning';
import { EQUIPMENT } from '../data/equipment';
import { itemDef } from '../data/items';
import { NODES, NODE_BY_ID, type KnowledgeNode } from '../data/knowledge';
import { RECIPES } from '../data/recipes';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { MATERIAL_ORDER } from '../data/materials';
import {
  addItem, allInstances, cloneInst, consumeAll, countOf, hasAll, makeGrid, removeItem, findPlaced,
  type Grid, type ItemInstance,
} from '../inventory/grid';
import {
  attachError, attachPart, createItem, detachPart, durableParts, isArmor, isWeaponBase, repairCost, repairItem,
  upgradeApplies, levelOf,
} from './gear';
import { ARMORS } from '../data/armors';
import { emptyPrep, type HubSave, type RaidSession } from './save';
import type { SlotKind } from '../core/types';

/**
 * 허브 규칙 (HubSave 를 제자리에서 수정하는 순수 함수들 — UI 는 호출 후 저장/갱신만 한다).
 * 실패는 { ok:false, msg } 로 돌려주고 상태는 바뀌지 않는다.
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; msg: string };
const fail = (msg: string): { ok: false; msg: string } => ({ ok: false, msg });

const LOG_MAX = 20;
export function pushLog(save: HubSave, msg: string) {
  save.log.push(msg);
  if (save.log.length > LOG_MAX) save.log.splice(0, save.log.length - LOG_MAX);
}

const gridSnapshot = (g: Grid) => JSON.stringify(g.placed);
const gridRestore = (g: Grid, snap: string) => { g.placed = JSON.parse(snap); };

// ======================= 지식 노드 / 분석기 =======================
export const isUnlocked = (s: HubSave, nodeId: string) => nodeId in s.nodes;

/** 창고에 있는 분석기 중 최고 단계 (없으면 0). 연구 장비는 마모 없이 영구 */
export function analyzerTier(s: HubSave): number {
  let t = 0;
  for (const i of allInstances(s.stash)) {
    const e = EQUIPMENT[i.defId];
    if (e?.type === 'analyzer') t = Math.max(t, e.tier);
  }
  return t;
}

/** 이 샘플로 다음에 열리는 노드: 아직 잠긴 노드 중 order 가 가장 낮고 선행 조건을 만족하는 것 */
export function nextNodeFor(s: HubSave, sampleId: string): KnowledgeNode | null {
  return NODES.filter((n) => n.sampleId === sampleId && !isUnlocked(s, n.id) && n.requires.every((r) => isUnlocked(s, r)))
    .sort((a, b) => a.order - b.order)[0] ?? null;
}

/** 보유 샘플 종류 (창고 → 안전 보관함 순으로 찾는다) */
export function findSampleGrid(s: HubSave, sampleId: string): Grid | null {
  return countOf(s.stash, sampleId) > 0 ? s.stash : countOf(s.safe, sampleId) > 0 ? s.safe : null;
}

export const jobMs = (seconds: number) => Math.max(0, Math.round(seconds * 1000 * TUNING.hub.timeScale));
/** 남은 시간(ms). 시계가 거꾸로 가도(now < startedAt) 전체 시간을 넘지 않는다 */
export const remainingMs = (job: { startedAt: number; durationMs: number }, now: number) =>
  Math.min(job.durationMs, Math.max(0, job.startedAt + job.durationMs - now));

export function analysisStatus(s: HubSave, sampleId: string): Result<{ node: KnowledgeNode }> {
  if (s.analysis) return fail('이미 분석 중');
  const node = nextNodeFor(s, sampleId);
  if (!node) return fail('해금할 노드가 더 없음');
  if (!findSampleGrid(s, sampleId)) return fail('샘플이 없음');
  const tier = analyzerTier(s);
  if (tier < node.analyzerTier) return fail(`분석기 ${node.analyzerTier}단계 필요 (보유 ${tier}단계)`);
  return { ok: true, node };
}

export function startAnalysis(s: HubSave, sampleId: string, now: number): Result<{ node: KnowledgeNode }> {
  const st = analysisStatus(s, sampleId);
  if (!st.ok) return st;
  consumeAll(findSampleGrid(s, sampleId)!, { [sampleId]: 1 });
  s.analysis = { nodeId: st.node.id, startedAt: now, durationMs: jobMs(st.node.analyzeSeconds) };
  return st;
}

/** 시간이 지난 분석·연구를 확정한다. 화면을 떠나거나 앱을 껐다 켠 뒤에도 호출하면 따라잡는다. 알림 문구 반환 */
export function resolveJobs(s: HubSave, now: number): string[] {
  const out: string[] = [];
  if (s.analysis && remainingMs(s.analysis, now) <= 0) {
    const n = NODE_BY_ID[s.analysis.nodeId];
    s.nodes[n.id] = now;
    s.analysis = null;
    out.push(`분석 완료: 새 지식 노드 「${n.name}」 해금 — ${n.weaponName} 제작·개량 가능`);
  }
  if (s.research && remainingMs(s.research, now) <= 0) {
    const j = s.research;
    const item = findItem(s, j.itemUid);
    const u = UPGRADE_BY_ID[j.upgradeId];
    s.research = null;
    if (item) {
      item.lv = { ...(item.lv ?? {}), [j.upgradeId]: j.toLevel };
      out.push(`연구 완료: ${itemDef(item.defId).name} — ${u.name} Lv${j.toLevel}`);
    } else out.push(`연구 중단: 대상 아이템을 찾을 수 없음 (${u.name})`);
  }
  for (const m of out) pushLog(s, m);
  return out;
}

// ======================= 아이템 찾기 / 점유 =======================
/** 창고·안전 보관함·출격 준비의 모든 아이템 (장착 부품 포함)에서 uid 로 찾는다 */
export function findItem(s: HubSave, uid: string): ItemInstance | undefined {
  const scan = (list: ItemInstance[]): ItemInstance | undefined => {
    for (const i of list) {
      if (i.uid === uid) return i;
      const p = scan(Object.values(i.parts ?? {}).filter((x): x is ItemInstance => !!x));
      if (p) return p;
    }
    return undefined;
  };
  return scan([
    ...allInstances(s.stash), ...allInstances(s.safe), ...allInstances(s.prep.bag),
    ...s.prep.weapons, ...Object.values(s.prep.armor).filter((x): x is ItemInstance => !!x),
  ]);
}

/** 연구 중인 아이템 (옮기기·장비 장착 불가) */
export function busyUids(s: HubSave): Set<string> {
  const set = new Set<string>();
  if (s.research) set.add(s.research.itemUid);
  return set;
}

/** 이 아이템(또는 그 장착 부품)이 연구 중인가 */
export function isBusy(s: HubSave, inst: ItemInstance): boolean {
  const b = busyUids(s);
  if (b.has(inst.uid)) return true;
  return Object.values(inst.parts ?? {}).some((p) => !!p && b.has(p.uid));
}

// ======================= 연구대 =======================
export function researchStatus(s: HubSave, uid: string, upgradeId: string): Result<{ toLevel: number; cost: Record<string, number>; seconds: number }> {
  const u = UPGRADE_BY_ID[upgradeId];
  if (!u) return fail('알 수 없는 개량');
  if (s.research) return fail('이미 연구 중');
  if (!isUnlocked(s, u.node)) return fail('노드가 잠겨 있음');
  const item = findItem(s, uid);
  if (!item || !upgradeApplies(upgradeId, item)) return fail('적용할 수 없는 대상');
  const lv = levelOf(item, upgradeId);
  if (lv >= u.maxLevel) return fail('최대 레벨');
  const cost = u.cost[lv];
  if (!hasAll(s.stash, cost)) return fail('재료 부족');
  return { ok: true, toLevel: lv + 1, cost, seconds: u.seconds[lv] };
}

export function startResearch(s: HubSave, uid: string, upgradeId: string, now: number): Result {
  const st = researchStatus(s, uid, upgradeId);
  if (!st.ok) return st;
  consumeAll(s.stash, st.cost);
  s.research = { itemUid: uid, upgradeId, toLevel: st.toLevel, startedAt: now, durationMs: jobMs(st.seconds) };
  return { ok: true };
}

// ======================= 작업대: 제작 / 장착 / 수리 =======================
export function craftStatus(s: HubSave, recipeId: string): Result {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return fail('알 수 없는 레시피');
  if (r.node && !isUnlocked(s, r.node)) return fail('노드가 잠겨 있음');
  if (!hasAll(s.stash, r.cost)) return fail('재료 부족');
  return { ok: true };
}

export function craft(s: HubSave, recipeId: string): Result<{ item: ItemInstance }> {
  const st = craftStatus(s, recipeId);
  if (!st.ok) return st;
  const r = RECIPES.find((x) => x.id === recipeId)!;
  const snap = gridSnapshot(s.stash);
  consumeAll(s.stash, r.cost);
  const item = createItem(r.out);
  if (addItem(s.stash, item)) { gridRestore(s.stash, snap); return fail('창고 공간 부족'); }
  return { ok: true, item };
}

/** 창고의 부품을 창고의 무기에 장착. 교체된 부품은 창고로 돌아온다 */
export function attach(s: HubSave, weaponUid: string, partUid: string): Result {
  const w = findPlaced(s.stash, weaponUid)?.inst, p = findPlaced(s.stash, partUid)?.inst;
  if (!w || !p) return fail('창고에 있는 무기·부품만 가능');
  if (isBusy(s, w) || isBusy(s, p)) return fail('연구 중인 아이템');
  const err = attachError(w, p);
  if (err) return fail(err);
  const snap = gridSnapshot(s.stash);
  const prevParts = w.parts; // attachPart 는 parts 를 새 객체로 교체하므로 참조만 들고 있으면 복구 가능
  removeItem(s.stash, partUid);
  const old = attachPart(w, p);
  if (old && addItem(s.stash, old)) {
    gridRestore(s.stash, snap);
    if (prevParts) w.parts = prevParts; else delete w.parts;
    return fail('교체된 부품을 둘 창고 공간이 부족');
  }
  return { ok: true };
}

export function detach(s: HubSave, weaponUid: string, slot: SlotKind): Result {
  const w = findPlaced(s.stash, weaponUid)?.inst;
  if (!w?.parts?.[slot]) return fail('분리할 부품이 없음');
  if (isBusy(s, w)) return fail('연구 중인 아이템');
  const part = w.parts[slot]!;
  if (addItem(s.stash, part)) return fail('창고 공간 부족');
  detachPart(w, slot);
  return { ok: true };
}

/** 수리: 창고에 있는 아이템만. 내구도 0 수리는 여기서만 가능 */
export function repair(s: HubSave, uid: string): Result {
  const item = findPlaced(s.stash, uid)?.inst;
  if (!item) return fail('창고에 있는 아이템만 수리 가능');
  const cost = repairCost(item);
  if (!cost) return fail('수리할 필요 없음');
  if (!hasAll(s.stash, cost)) return fail('재료 부족');
  consumeAll(s.stash, cost);
  repairItem(item);
  return { ok: true };
}

// ======================= 출격 준비 =======================
export function equipWeapon(s: HubSave, uid: string): Result {
  const i = findPlaced(s.stash, uid)?.inst;
  if (!i || !isWeaponBase(i)) return fail('창고의 무기 베이스를 선택');
  if (isBusy(s, i)) return fail('연구 중인 아이템');
  if (s.prep.weapons.length >= TUNING.hub.weaponSlots) return fail(`무기 슬롯 ${TUNING.hub.weaponSlots}개가 가득 참`);
  removeItem(s.stash, uid);
  s.prep.weapons.push(i);
  return { ok: true };
}

export function equipArmor(s: HubSave, uid: string): Result {
  const i = findPlaced(s.stash, uid)?.inst;
  if (!i || !isArmor(i)) return fail('창고의 방어구를 선택');
  if (isBusy(s, i)) return fail('연구 중인 아이템');
  const slot = ARMORS[i.defId].slot;
  const old = s.prep.armor[slot];
  const snap = gridSnapshot(s.stash);
  removeItem(s.stash, uid);
  if (old && addItem(s.stash, old)) { gridRestore(s.stash, snap); return fail('교체된 방어구를 둘 창고 공간이 부족'); }
  s.prep.armor[slot] = i;
  return { ok: true };
}

/** 장착 해제 → 창고. 공간이 없으면 실패 */
export function unequip(s: HubSave, what: { weapon: string } | { armor: 'body' | 'aux' }): Result {
  if ('weapon' in what) {
    const idx = s.prep.weapons.findIndex((w) => w.uid === what.weapon);
    if (idx < 0) return fail('장착된 무기가 아님');
    if (addItem(s.stash, s.prep.weapons[idx])) return fail('창고 공간 부족');
    s.prep.weapons.splice(idx, 1);
    return { ok: true };
  }
  const a = s.prep.armor[what.armor];
  if (!a) return fail('장착된 방어구가 아님');
  if (addItem(s.stash, a)) return fail('창고 공간 부족');
  delete s.prep.armor[what.armor];
  return { ok: true };
}

/** 가방·장착을 전부 창고로 되돌린다. 못 넣는 것은 그대로 남기고 개수를 알려 준다 */
export function stowPrep(s: HubSave): { moved: number; left: number } {
  let moved = 0, left = 0;
  for (const p of [...s.prep.bag.placed]) {
    const rest = addItem(s.stash, p.inst);
    if (rest) { left++; } else { removeItem(s.prep.bag, p.inst.uid); moved++; }
  }
  for (const w of [...s.prep.weapons]) { if (unequip(s, { weapon: w.uid }).ok) moved++; else left++; }
  for (const k of ['body', 'aux'] as const) if (s.prep.armor[k]) { if (unequip(s, { armor: k }).ok) moved++; else left++; }
  return { moved, left };
}

export const AMMO_IDS = MATERIAL_ORDER;
const ammoTotal = (g: Grid) => AMMO_IDS.reduce((a, id) => a + countOf(g, id), 0);

/** 출격: prep → raid. 무기가 없으면 불가. 탄이 너무 적으면 보급 재료를 가방에 채운다(진행 불능 방지) */
export function beginRaid(s: HubSave, now: number): Result {
  if (s.raid) return fail('이미 레이드 중');
  if (!s.prep.weapons.length) return fail('무기를 1개 이상 장착하세요');
  const R = TUNING.raid;
  const short = R.minKitTotal - ammoTotal(s.prep.bag);
  if (short > 0) addItem(s.prep.bag, createItem(R.rationMaterial, short));
  s.raid = { ...s.prep, startedAt: now };
  s.prep = emptyPrep();
  s.stats.raids++;
  return { ok: true };
}

// ======================= 레이드 정산 =======================
const clearFound = (i: ItemInstance) => { delete i.found; for (const p of Object.values(i.parts ?? {})) if (p) clearFound(p); };

export interface ExtractReport { gained: Record<string, number>; overflow: number }
export interface DeathReport { lost: ItemInstance[]; kept: ItemInstance[] }

function raidItems(r: RaidSession): ItemInstance[] {
  return [
    ...r.weapons, ...Object.values(r.armor).filter((x): x is ItemInstance => !!x),
    ...allInstances(r.bag),
  ];
}

/** 탈출 성공: 가방·장착 장비·안전 보관함을 창고로 입고. 창고가 가득 차 못 들어간 것은 pending 으로 (입고 선택 화면) */
export function settleExtract(s: HubSave): ExtractReport {
  const r = s.raid;
  const report: ExtractReport = { gained: {}, overflow: 0 };
  if (!r) return report;
  const incoming = [...raidItems(r), ...allInstances(s.safe)];
  s.raid = null;
  s.safe = makeGrid(s.safe.w, s.safe.h);
  s.stats.extracts++;
  for (const it of incoming) {
    clearFound(it);
    const name = it.defId;
    report.gained[name] = (report.gained[name] ?? 0) + it.count;
    const rest = addItem(s.stash, it);
    if (rest) { report.overflow += rest.count; addItem(s.pending, rest); }
  }
  return report;
}

/** 사망: 가방·장착 장비 전부 손실, 안전 보관함은 유지(획득 표시만 지움). 무기가 하나도 없으면 보급 무기 지급(진행 불능 방지) */
export function settleDeath(s: HubSave): DeathReport {
  const r = s.raid;
  const lost = r ? raidItems(r).map(cloneInst) : [];
  s.raid = null;
  s.stats.deaths++;
  for (const i of allInstances(s.safe)) clearFound(i);
  ensureStarterWeapon(s);
  return { lost, kept: allInstances(s.safe) };
}

/** 어디에도 무기 베이스가 없으면 운동량 사출기 1개를 창고(안 되면 입고 대기)에 지급 */
export function ensureStarterWeapon(s: HubSave) {
  const grids = [s.stash, s.safe, s.prep.bag, s.pending];
  const has = grids.some((g) => allInstances(g).some(isWeaponBase)) || s.prep.weapons.length > 0;
  if (has) return false;
  const w = createItem('momentum_launcher');
  if (addItem(s.stash, w)) addItem(s.pending, w);
  pushLog(s, '보급 무기 지급: 운동량 사출기');
  return true;
}

// ======================= 입고 대기 =======================
export const pendingCount = (s: HubSave) => s.pending.placed.length;
export function discardPending(s: HubSave, uid: string): boolean {
  return !!removeItem(s.pending, uid);
}

// ======================= 레이드 가방 편의 =======================
/** 레이드 중 획득 아이템을 가방에 넣는다 (found 표시). 공간이 없으면 아무것도 넣지 않고 false */
export function pickUpToBag(bag: Grid, defId: string, count: number): boolean {
  const snap = gridSnapshot(bag);
  const item = createItem(defId, count, { found: true });
  if (addItem(bag, item)) { gridRestore(bag, snap); return false; }
  return true;
}

/** 안전 보관함에 넣을 수 있는가: 레이드 중 획득한 것만. 이유 문자열 또는 null(가능) */
export function safeBoxRejects(inst: ItemInstance): string | null {
  return inst.found ? null : '레이드에서 획득한 아이템만 넣을 수 있습니다';
}

export { durableParts };
