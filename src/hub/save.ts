import { TUNING } from '../config/tuning';
import { NODE_BY_ID } from '../data/knowledge';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { ITEMS } from '../data/items';
import { ARMORS as ARMORS_ } from '../data/armors';
import { START_ITEMS } from '../data/startState';
import { addItem, isValidInst, makeGrid, placeAt, canPlace, type Grid, type ItemInstance } from '../inventory/grid';
import { createItem } from './gear';
import { emptyEquip, type Carry, type Equip } from './equip';
import { WEAPON_SLOTS } from '../data/weaponSlots';
import { ARMOR_SLOTS } from '../data/armors';
import { CONTAINER_SLOTS, CONTAINERS } from '../data/containers';

/**
 * 허브 저장 데이터 (localStorage, v2). 시간 기반 작업은 타임스탬프(ms)로 저장 → 화면을 떠나거나 껐다 켜도 진행된다.
 *
 * 위치 규칙:
 *  stash   창고 (용량 큼)       safe    안전 보관함 (레이드에서 획득한 것만 넣을 수 있음, 사망해도 유지)
 *  prep    출격 준비(가방 격자 + 장착 무기·방어구)    raid  진행 중 레이드(non-null 인 채 로드되면 이탈 = 사망)
 *  pending 탈출 후 창고에 못 들어간 아이템 (버리거나 자리를 만들어 입고해야 함)
 */
export const SAVE_KEY = 'physics-extraction-save-v2';

export type { Equip, Carry };
export interface PrepState extends Equip { carry: Carry }
export interface RaidSession extends PrepState { startedAt: number }

export interface AnalysisJob { nodeId: string; startedAt: number; durationMs: number }
export interface ResearchJob { itemUid: string; upgradeId: string; toLevel: number; startedAt: number; durationMs: number }

export interface HubSave {
  v: 2;
  stash: Grid;
  safe: Grid;
  prep: PrepState;
  raid: RaidSession | null;
  pending: Grid;
  /** 해금된 노드 id → 해금 시각(ms) */
  nodes: Record<string, number>;
  analysis: AnalysisJob | null;
  research: ResearchJob | null;
  /** 최근 알림 (분석 완료 등) */
  log: string[];
  stats: { raids: number; extracts: number; deaths: number };
}

const G = TUNING.hub.grid;
export const emptyCarry = (): Carry => ({ pockets: makeGrid(G.pockets.w, G.pockets.h), vest: null, backpack: null });
export const emptyPrep = (): PrepState => ({ ...emptyEquip(), carry: emptyCarry() });

export function defaultSave(): HubSave {
  const save: HubSave = {
    v: 2,
    stash: makeGrid(G.stash.w, G.stash.h),
    safe: makeGrid(G.safe.w, G.safe.h),
    prep: emptyPrep(),
    raid: null,
    pending: makeGrid(G.pending.w, G.pending.h),
    nodes: {},
    analysis: null,
    research: null,
    log: [],
    stats: { raids: 0, extracts: 0, deaths: 0 },
  };
  for (const it of START_ITEMS) addItem(save.stash, createItem(it.id, it.count ?? 1));
  return save;
}

export function serializeSave(s: HubSave): string {
  return JSON.stringify(s);
}

// ---------- 불러오기: 손상·버전 차이에 강하게. 알아볼 수 없는 아이템만 버리고 나머지는 살린다 ----------

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** 저장된 격자를 설정된 크기로 다시 만든다. 위치가 유효하면 유지, 아니면 자동 배치, 그래도 안 되면 overflow 로 */
function rebuildGrid(raw: unknown, w: number, h: number, overflow: ItemInstance[]): Grid {
  const g = makeGrid(w, h);
  const placed = isObj(raw) && Array.isArray(raw.placed) ? raw.placed : [];
  const loose: ItemInstance[] = [];
  for (const p of placed) {
    if (!isObj(p) || !isValidInst(p.inst)) continue;
    const inst = p.inst as ItemInstance;
    if (typeof p.x === 'number' && typeof p.y === 'number' && typeof p.rot === 'boolean' && canPlace(g, inst, p.x, p.y, p.rot)) {
      placeAt(g, inst, p.x, p.y, p.rot);
    } else loose.push(inst);
  }
  for (const inst of loose) { const rest = addItem(g, inst); if (rest) overflow.push(rest); }
  return g;
}

const validInst = (x: unknown): ItemInstance | undefined => (isValidInst(x) ? x : undefined);

function rebuildEquip(raw: unknown): Equip {
  const r = isObj(raw) ? raw : {};
  const e = emptyEquip();
  const w = isObj(r.weapons) ? r.weapons : {};
  const a = isObj(r.armor) ? r.armor : {};
  const c = isObj(r.containers) ? r.containers : {};
  for (const s of WEAPON_SLOTS) { const i = validInst(w[s.id]); if (i && ITEMS[i.defId]?.kind === 'weapon_base') e.weapons[s.id] = i; }
  for (const k of ARMOR_SLOTS) { const i = validInst(a[k]); if (i && ARMORS_[i.defId]?.slot === k) e.armor[k] = i; }
  for (const k of CONTAINER_SLOTS) { const i = validInst(c[k]); if (i && CONTAINERS[i.defId]?.slot === k) e.containers[k] = i; }
  return e;
}

/** 주머니 + 장착한 조끼/가방 크기의 격자를 복원 (장비가 없으면 격자도 없다. 장비가 사라졌다면 내용물은 overflow 로) */
function rebuildCarry(raw: unknown, equip: Equip, overflow: ItemInstance[]): Carry {
  const r = isObj(raw) ? raw : {};
  const carry = emptyCarry();
  carry.pockets = rebuildGrid(r.pockets, G.pockets.w, G.pockets.h, overflow);
  for (const [slot, key] of [['vest', 'vest'], ['backpack', 'backpack']] as const) {
    const def = equip.containers[slot] ? CONTAINERS[equip.containers[slot]!.defId] : undefined;
    if (def) carry[key] = rebuildGrid(r[key], def.w, def.h, overflow);
    else rebuildGrid(r[key], 99, 99, overflow); // 장비가 없는데 내용물이 있으면 잃지 않게 입고 대기로
  }
  return carry;
}

const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

/** 저장 문자열 → HubSave. 없거나 손상됐으면 새 게임. raid 가 남아 있으면 그대로 두고 호출측이 이탈(사망) 처리한다 */
export function parseSave(raw: string | null): HubSave {
  if (!raw) return defaultSave();
  try {
    const r: unknown = JSON.parse(raw);
    if (!isObj(r) || r.v !== 2) return defaultSave();
    const overflow: ItemInstance[] = [];
    const stash = rebuildGrid(r.stash, G.stash.w, G.stash.h, overflow);
    const safe = rebuildGrid(r.safe, G.safe.w, G.safe.h, overflow);
    const pending = rebuildGrid(r.pending, G.pending.w, G.pending.h, []);
    for (const o of overflow) addItem(pending, o);
    const prepRaw = isObj(r.prep) ? r.prep : {};
    const prepEquip = rebuildEquip(prepRaw);
    const prep: PrepState = { ...prepEquip, carry: rebuildCarry(prepRaw.carry, prepEquip, overflow) };
    for (const o of overflow.splice(0)) addItem(pending, o);

    let raid: RaidSession | null = null;
    if (isObj(r.raid)) {
      const o: ItemInstance[] = [];
      const re = rebuildEquip(r.raid);
      raid = { ...re, carry: rebuildCarry(r.raid.carry, re, o), startedAt: num(r.raid.startedAt) };
    }
    const nodes: Record<string, number> = {};
    if (isObj(r.nodes)) for (const [k, v] of Object.entries(r.nodes)) if (NODE_BY_ID[k]) nodes[k] = num(v);

    let analysis: HubSave['analysis'] = null;
    if (isObj(r.analysis) && typeof r.analysis.nodeId === 'string' && NODE_BY_ID[r.analysis.nodeId] && !nodes[r.analysis.nodeId]) {
      analysis = { nodeId: r.analysis.nodeId, startedAt: num(r.analysis.startedAt), durationMs: Math.max(0, num(r.analysis.durationMs)) };
    }
    let research: HubSave['research'] = null;
    if (isObj(r.research) && typeof r.research.itemUid === 'string' && typeof r.research.upgradeId === 'string' && UPGRADE_BY_ID[r.research.upgradeId]) {
      research = {
        itemUid: r.research.itemUid, upgradeId: r.research.upgradeId, toLevel: num(r.research.toLevel, 1),
        startedAt: num(r.research.startedAt), durationMs: Math.max(0, num(r.research.durationMs)),
      };
    }
    const st = isObj(r.stats) ? r.stats : {};
    return {
      v: 2, stash, safe, prep, raid, pending, nodes, analysis, research,
      log: Array.isArray(r.log) ? r.log.filter((x): x is string => typeof x === 'string').slice(-20) : [],
      stats: { raids: num(st.raids), extracts: num(st.extracts), deaths: num(st.deaths) },
    };
  } catch {
    return defaultSave();
  }
}
