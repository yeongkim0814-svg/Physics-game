import { TUNING } from '../config/tuning';
import { NODE_BY_ID } from '../data/knowledge';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { START_ITEMS } from '../data/startState';
import { addItem, isValidInst, makeGrid, placeAt, canPlace, type Grid, type ItemInstance } from '../inventory/grid';
import { createItem } from './gear';

/**
 * 허브 저장 데이터 (localStorage, v2). 시간 기반 작업은 타임스탬프(ms)로 저장 → 화면을 떠나거나 껐다 켜도 진행된다.
 *
 * 위치 규칙:
 *  stash   창고 (용량 큼)       safe    안전 보관함 (레이드에서 획득한 것만 넣을 수 있음, 사망해도 유지)
 *  prep    출격 준비(가방 격자 + 장착 무기·방어구)    raid  진행 중 레이드(non-null 인 채 로드되면 이탈 = 사망)
 *  pending 탈출 후 창고에 못 들어간 아이템 (버리거나 자리를 만들어 입고해야 함)
 */
export const SAVE_KEY = 'physics-extraction-save-v2';

export interface Equip {
  weapons: ItemInstance[];
  armor: { body?: ItemInstance; aux?: ItemInstance };
}
export interface PrepState extends Equip { bag: Grid }
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
export const emptyPrep = (): PrepState => ({ bag: makeGrid(G.bag.w, G.bag.h), weapons: [], armor: {} });

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
  const armor = isObj(r.armor) ? r.armor : {};
  return {
    weapons: (Array.isArray(r.weapons) ? r.weapons : []).map(validInst).filter((x): x is ItemInstance => !!x).slice(0, TUNING.hub.weaponSlots),
    armor: { body: validInst(armor.body), aux: validInst(armor.aux) },
  };
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
    const prep: PrepState = { ...rebuildEquip(prepRaw), bag: rebuildGrid(prepRaw.bag, G.bag.w, G.bag.h, overflow) };
    for (const o of overflow.splice(0)) addItem(pending, o);

    let raid: RaidSession | null = null;
    if (isObj(r.raid)) {
      const o: ItemInstance[] = [];
      raid = { ...rebuildEquip(r.raid), bag: rebuildGrid(r.raid.bag, G.bag.w, G.bag.h, o), startedAt: num(r.raid.startedAt) };
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
