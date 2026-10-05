import type { BaseId, Persistent, StoredWeapon, WeaponState } from '../core/types';
import { TUNING } from '../config/tuning';
import { createWeaponState } from '../data/loadout';
import { BASES } from '../data/bases';
import { PARTS } from '../data/parts';
import { START_MATERIALS } from '../data/startState';

// 레이드 영속 데이터와 손실 규칙 (순수 함수 → 단위 테스트 대상). 저장소(localStorage) 접근은 RaidLoop 쪽.
//
// 규칙:
//  - stash(안전 보관함): 사망해도 유지. carried(소지품): 레이드 중에만 존재, 사망 시 손실
//  - 레이드 시작: 보관함의 무기 전부 + 재료 키트(보관함에 있는 만큼)를 소지품으로 가져간다
//  - 탈출 성공: 소지품 전부(남은 재료, 전리품, 무기)를 보관함에 합친다
//  - 레이드 도중 창을 닫으면(소지품이 남은 채 저장됨) 다음 로드 때 사망으로 처리 → 탭을 닫아 손실을 피할 수 없다
//  - 무기를 잃어도 베이스별 보급 무기(풀 내구도, 부품 없음)를 지급해 진행 불능을 막는다

export const SAVE_KEY = 'physics-extraction-save-v1';
export const BASE_IDS: BaseId[] = ['momentum_launcher', 'em_coil'];
export type Materials = Record<string, number>;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function totalMaterials(m: Materials): number {
  return Object.values(m).reduce((a, b) => a + b, 0);
}

export function addMaterials(a: Materials, b: Materials): Materials {
  const out: Materials = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** after − before (0 인 항목 제외). 레이드 결과의 재료 증감 표시용 */
export function diffMaterials(before: Materials, after: Materials): Materials {
  const out: Materials = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

export function toStored(ws: WeaponState): StoredWeapon {
  return { loadout: { base: ws.loadout.base, parts: { ...ws.loadout.parts } }, baseDurability: ws.baseDurability, partDurability: { ...ws.partDurability } };
}

export function toState(w: StoredWeapon): WeaponState {
  return { loadout: { base: w.loadout.base, parts: { ...w.loadout.parts } }, baseDurability: w.baseDurability, partDurability: { ...w.partDurability }, charge: 0 };
}

/** 보급 무기: 부품 없음, 풀 내구도 */
export function starterWeapon(base: BaseId): StoredWeapon {
  return toStored(createWeaponState({ base, parts: {} }));
}

export function defaultPersistent(): Persistent {
  return {
    stash: { weapons: BASE_IDS.map(starterWeapon), materials: { ...START_MATERIALS } },
    carried: { weapons: [], materials: {} },
  };
}

export interface LossReport { weapons: StoredWeapon[]; materials: Materials }

/** 사망: 소지품 전부 손실, 보관함은 그대로 */
export function settleDeath(p: Persistent): { p: Persistent; lost: LossReport } {
  const next = clone(p);
  const lost: LossReport = { weapons: next.carried.weapons, materials: next.carried.materials };
  next.carried = { weapons: [], materials: {} };
  return { p: next, lost };
}

/** 레이드 시작: 보관함 → 소지품 (무기 전부 + 재료 키트). 이전 레이드의 잔여 소지품은 사망으로 처리 */
export function beginRaid(p: Persistent): Persistent {
  let next = clone(p);
  if (next.carried.weapons.length || totalMaterials(next.carried.materials) > 0) next = settleDeath(next).p;

  next.carried.weapons = next.stash.weapons;
  next.stash.weapons = [];
  for (const base of BASE_IDS) {
    if (!next.carried.weapons.some((w) => w.loadout.base === base)) next.carried.weapons.push(starterWeapon(base));
  }

  const R = TUNING.raid;
  for (const [id, want] of Object.entries(R.kit)) {
    const take = Math.min(next.stash.materials[id] ?? 0, want);
    if (take <= 0) continue;
    next.stash.materials[id] -= take;
    next.carried.materials[id] = (next.carried.materials[id] ?? 0) + take;
  }
  const short = R.minKitTotal - totalMaterials(next.carried.materials);
  if (short > 0) next.carried.materials[R.rationMaterial] = (next.carried.materials[R.rationMaterial] ?? 0) + short;
  return next;
}

/** 탈출 성공: 소지품 전부를 보관함에 합친다. weapons 는 레이드 중 마모가 반영된 현재 무기 상태 */
export function settleExtract(p: Persistent, weapons: StoredWeapon[]): { p: Persistent; carriedOut: Materials } {
  const next = clone(p);
  const carriedOut = clone(next.carried.materials);
  next.stash.weapons = [...next.stash.weapons, ...clone(weapons)];
  next.stash.materials = addMaterials(next.stash.materials, carriedOut);
  next.carried = { weapons: [], materials: {} };
  return { p: next, carriedOut };
}

/** 자동 수리(아지트 수리 대체): 보관함 무기를 전부 최대 내구도로 */
export function repairWeapons(p: Persistent): Persistent {
  const next = clone(p);
  for (const w of next.stash.weapons) {
    w.baseDurability = BASES[w.loadout.base].maxDurability;
    for (const id of Object.keys(w.partDurability)) w.partDurability[id] = PARTS[id]?.maxDurability ?? w.partDurability[id];
  }
  return next;
}

const isMaterials = (m: unknown): m is Materials =>
  typeof m === 'object' && m !== null && Object.values(m).every((v) => typeof v === 'number' && v >= 0);
const isStoredWeapon = (w: unknown): w is StoredWeapon => {
  const x = w as StoredWeapon;
  return !!x && typeof x === 'object' && BASE_IDS.includes(x.loadout?.base) && typeof x.baseDurability === 'number' && isMaterials(x.partDurability);
};
const isBag = (b: unknown): b is Persistent['stash'] => {
  const x = b as Persistent['stash'];
  return !!x && Array.isArray(x.weapons) && x.weapons.every(isStoredWeapon) && isMaterials(x.materials);
};
export function isPersistent(x: unknown): x is Persistent {
  const p = x as Persistent;
  return !!p && typeof p === 'object' && isBag(p.stash) && isBag(p.carried);
}

export function serialize(p: Persistent): string {
  return JSON.stringify(p);
}

/** 저장 문자열 → Persistent. 없거나 손상되면 기본값. 소지품이 남아 있으면(레이드 중 이탈) 사망 처리 */
export function loadPersistent(raw: string | null): Persistent {
  if (!raw) return defaultPersistent();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistent(parsed)) return defaultPersistent();
    return settleDeath(parsed).p;
  } catch {
    return defaultPersistent();
  }
}
