import { ITEMS, itemDef } from '../data/items';
import type { SlotKind } from '../core/types';

/**
 * 격자 인벤토리 순수 로직 (UI 없음, 단위 테스트 대상). 격자 함수는 전달받은 Grid 를 제자리에서 수정한다.
 * 저장 형식이기도 하다(JSON 직렬화 가능).
 */

/** 아이템 인스턴스. 정의(ItemDef)는 defId 로 data/items.ts 에서 찾는다 */
export interface ItemInstance {
  uid: string;
  defId: string;
  /** 스택 수량 (스택 안 되는 아이템은 1) */
  count: number;
  /** 현재 내구도 (내구도 있는 아이템: 무기 베이스/부품/방어구) */
  dur?: number;
  /** 개량 레벨: upgradeId → level */
  lv?: Record<string, number>;
  /** 무기 베이스에 장착된 부품: 슬롯 → 부품 인스턴스 */
  parts?: Partial<Record<SlotKind, ItemInstance>>;
  /** 이번 레이드에서 획득한 아이템 (안전 보관함 입장 조건). 탈출/사망 정산에서 지운다 */
  found?: boolean;
}

export interface Placed { inst: ItemInstance; x: number; y: number; rot: boolean }
export interface Grid { w: number; h: number; placed: Placed[] }

let counter = 0;
/** 충돌 가능성이 무시할 만한 짧은 고유 id (저장 카운터 없이 레이드 중에도 생성 가능) */
export function newUid(): string {
  counter = (counter + 1) % 1679616;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function newInstance(defId: string, count = 1, extra: Partial<ItemInstance> = {}): ItemInstance {
  const d = itemDef(defId);
  return { uid: newUid(), defId, count: Math.min(Math.max(1, count), d.stack), ...extra };
}

export const makeGrid = (w: number, h: number): Grid => ({ w, h, placed: [] });
export const cloneInst = <T extends ItemInstance>(i: T): T => JSON.parse(JSON.stringify(i));

export function footprint(inst: ItemInstance, rot: boolean): { w: number; h: number } {
  const d = itemDef(inst.defId);
  return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

export const isStack = (i: ItemInstance) => itemDef(i.defId).stack > 1;
export const maxStack = (i: ItemInstance) => itemDef(i.defId).stack;
/** 상태(내구도/개량/부품)가 없는 단순 스택인가 */
const isPlain = (i: ItemInstance) => i.dur === undefined && !i.lv && !i.parts;

/** a 가 b 의 스택에 합쳐질 수 있는가 (같은 종류, 같은 획득 출처, 상태 없음) */
export function canMerge(a: ItemInstance, b: ItemInstance): boolean {
  return a.uid !== b.uid && a.defId === b.defId && isStack(a) && isPlain(a) && isPlain(b) && !!a.found === !!b.found && b.count < maxStack(b);
}

export function findPlaced(g: Grid, uid: string): Placed | undefined {
  return g.placed.find((p) => p.inst.uid === uid);
}

/** (x,y) 칸을 차지한 아이템 */
export function itemAt(g: Grid, x: number, y: number): Placed | undefined {
  for (const p of g.placed) {
    const f = footprint(p.inst, p.rot);
    if (x >= p.x && x < p.x + f.w && y >= p.y && y < p.y + f.h) return p;
  }
  return undefined;
}

/** w×h 영역이 격자 안이고 (ignoreUid 제외) 다른 아이템과 겹치지 않는가 */
export function fits(g: Grid, w: number, h: number, x: number, y: number, ignoreUid?: string): boolean {
  if (x < 0 || y < 0 || x + w > g.w || y + h > g.h) return false;
  for (const p of g.placed) {
    if (p.inst.uid === ignoreUid) continue;
    const f = footprint(p.inst, p.rot);
    if (x < p.x + f.w && x + w > p.x && y < p.y + f.h && y + h > p.y) return false;
  }
  return true;
}

export function canPlace(g: Grid, inst: ItemInstance, x: number, y: number, rot: boolean, ignoreUid?: string): boolean {
  const f = footprint(inst, rot);
  return fits(g, f.w, f.h, x, y, ignoreUid);
}

/** 첫 번째로 들어가는 빈자리 (위→아래, 왼→오른쪽). 회전 안 한 것 우선, 안 되면 90° 회전 */
export function findSpot(g: Grid, inst: ItemInstance, ignoreUid?: string): { x: number; y: number; rot: boolean } | null {
  const d = itemDef(inst.defId);
  const rots = d.w === d.h ? [false] : [false, true];
  for (const rot of rots) {
    const f = footprint(inst, rot);
    for (let y = 0; y + f.h <= g.h; y++) {
      for (let x = 0; x + f.w <= g.w; x++) if (fits(g, f.w, f.h, x, y, ignoreUid)) return { x, y, rot };
    }
  }
  return null;
}

/** 지정 위치에 배치(검증은 호출측 canPlace). */
export function placeAt(g: Grid, inst: ItemInstance, x: number, y: number, rot: boolean) {
  g.placed.push({ inst, x, y, rot });
}

export function removeItem(g: Grid, uid: string): Placed | undefined {
  const i = g.placed.findIndex((p) => p.inst.uid === uid);
  return i >= 0 ? g.placed.splice(i, 1)[0] : undefined;
}

export function moveItem(g: Grid, uid: string, x: number, y: number, rot: boolean): boolean {
  const p = findPlaced(g, uid);
  if (!p || !canPlace(g, p.inst, x, y, rot, uid)) return false;
  p.x = x; p.y = y; p.rot = rot;
  return true;
}

/**
 * 격자에 추가. 스택 아이템은 기존 스택을 먼저 채우고 남은 양을 새 칸에 넣는다.
 * 전부 들어가면 null, 못 넣은 나머지가 있으면 그 인스턴스(수량 조정됨)를 반환한다. 부분 성공 시 들어간 만큼은 격자에 남는다.
 */
export function addItem(g: Grid, inst: ItemInstance): ItemInstance | null {
  const rest = inst;
  if (isStack(rest) && isPlain(rest)) {
    for (const p of g.placed) {
      if (rest.count <= 0) break;
      if (!canMerge(rest, p.inst)) continue;
      const take = Math.min(rest.count, maxStack(p.inst) - p.inst.count);
      p.inst.count += take;
      rest.count -= take;
    }
  }
  while (rest.count > 0) {
    const part = rest.count > maxStack(rest) ? { ...rest, uid: newUid(), count: maxStack(rest) } : rest;
    const spot = findSpot(g, part);
    if (!spot) return rest;
    placeAt(g, part, spot.x, spot.y, spot.rot);
    if (part === rest) { return null; }
    rest.count -= part.count;
  }
  return null;
}

/** 스택에서 qty 개를 떼어 새 인스턴스로 반환 (원본 수량 감소). qty ≥ count 면 원본 자체를 반환(분할 없음) */
export function splitStack(inst: ItemInstance, qty: number): ItemInstance {
  if (qty >= inst.count) return inst;
  inst.count -= qty;
  return { ...cloneInst(inst), uid: newUid(), count: qty };
}

/** defId 총 수량 (found: undefined = 전부, true/false = 해당 출처만) */
export function countOf(g: Grid, defId: string, found?: boolean): number {
  let n = 0;
  for (const p of g.placed) if (p.inst.defId === defId && (found === undefined || !!p.inst.found === found)) n += p.inst.count;
  return n;
}

/** n 개 소모 (획득 출처 우선순위: 들고 온 것 → 레이드에서 얻은 것, 같은 출처에서는 수량이 적은 스택부터). 부족하면 아무것도 안 하고 false */
export function consumeFrom(g: Grid, defId: string, n: number): boolean {
  if (countOf(g, defId) < n) return false;
  const stacks = g.placed.filter((p) => p.inst.defId === defId)
    .sort((a, b) => Number(!!a.inst.found) - Number(!!b.inst.found) || a.inst.count - b.inst.count);
  let left = n;
  for (const p of stacks) {
    const take = Math.min(left, p.inst.count);
    p.inst.count -= take;
    left -= take;
    if (left <= 0) break;
  }
  g.placed = g.placed.filter((p) => p.inst.count > 0);
  return true;
}

/** 재료/아이템 맵 소모. 한 종류라도 부족하면 아무것도 소모하지 않고 false */
export function consumeAll(g: Grid, cost: Record<string, number>): boolean {
  if (!hasAll(g, cost)) return false;
  for (const [id, n] of Object.entries(cost)) consumeFrom(g, id, n);
  return true;
}
export const hasAll = (g: Grid, cost: Record<string, number>) => Object.entries(cost).every(([id, n]) => countOf(g, id) >= n);

export const usedCells = (g: Grid) => g.placed.reduce((s, p) => { const f = footprint(p.inst, p.rot); return s + f.w * f.h; }, 0);
export const freeCells = (g: Grid) => g.w * g.h - usedCells(g);

/**
 * 정렬: 같은 종류 스택을 합치고, 큰 것부터(면적↓, 종류, 이름) 빈 곳에 다시 채운다. 하나라도 못 넣으면 원래 배치를 유지하고 false.
 */
export function sortGrid(g: Grid): boolean {
  const original = g.placed.map((p) => ({ ...p }));
  const tmp: Grid = makeGrid(g.w, g.h);
  const items = g.placed.map((p) => p.inst).map((i) => i);
  // 스택 병합
  const merged: ItemInstance[] = [];
  for (const it of items) {
    let rest: ItemInstance | null = it;
    if (isStack(it) && isPlain(it)) {
      for (const m of merged) {
        if (!rest) break;
        if (m.defId === it.defId && !!m.found === !!it.found && isPlain(m) && m.count < maxStack(m)) {
          const take = Math.min(rest.count, maxStack(m) - m.count);
          m.count += take;
          rest.count -= take;
          if (rest.count <= 0) rest = null;
        }
      }
    }
    if (rest) merged.push(rest);
  }
  const order = (i: ItemInstance) => { const f = footprint(i, false); return f.w * f.h; };
  merged.sort((a, b) => order(b) - order(a) || ITEMS[a.defId].kind.localeCompare(ITEMS[b.defId].kind) || a.defId.localeCompare(b.defId) || b.count - a.count);
  for (const it of merged) {
    const spot = findSpot(tmp, it);
    if (!spot) { g.placed = original; return false; }
    placeAt(tmp, it, spot.x, spot.y, spot.rot);
  }
  g.placed = tmp.placed;
  return true;
}

/** 모든 아이템 인스턴스 (부착 부품 제외) */
export const allInstances = (g: Grid) => g.placed.map((p) => p.inst);

/** JSON 으로 읽은 Grid 가 형식·범위·겹침을 만족하는가 (손상된 저장 방어) */
export function isValidGrid(x: unknown): x is Grid {
  const g = x as Grid;
  if (!g || typeof g !== 'object' || !Number.isInteger(g.w) || !Number.isInteger(g.h) || g.w <= 0 || g.h <= 0 || !Array.isArray(g.placed)) return false;
  const probe = makeGrid(g.w, g.h);
  for (const p of g.placed) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.rot !== 'boolean' || !isValidInst(p.inst)) return false;
    if (!canPlace(probe, p.inst, p.x, p.y, p.rot)) return false;
    placeAt(probe, p.inst, p.x, p.y, p.rot);
  }
  return true;
}

export function isValidInst(i: unknown): i is ItemInstance {
  const x = i as ItemInstance;
  if (!x || typeof x !== 'object' || typeof x.uid !== 'string' || typeof x.defId !== 'string' || !ITEMS[x.defId]) return false;
  if (!Number.isInteger(x.count) || x.count < 1 || x.count > ITEMS[x.defId].stack) return false;
  if (x.dur !== undefined && typeof x.dur !== 'number') return false;
  if (x.parts !== undefined) {
    if (typeof x.parts !== 'object' || x.parts === null) return false;
    if (!Object.values(x.parts).every((p) => isValidInst(p))) return false;
  }
  return true;
}
