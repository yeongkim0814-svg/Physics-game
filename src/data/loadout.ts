import type { Loadout, PartDef, SlotKind, StatMods, WeaponState } from '../core/types';
import { BASES } from './bases';
import { PARTS } from './parts';

/** 장착 가능 슬롯. 'sub'(부전공)는 이번 범위에서 비활성 */
export const ACTIVE_SLOTS: SlotKind[] = ['front', 'rear', 'top'];

/** 로드아웃 검증: 오류 메시지 배열(빈 배열이면 유효) */
export function validateLoadout(l: Loadout): string[] {
  const errs: string[] = [];
  if (!BASES[l.base]) errs.push(`unknown base: ${l.base}`);
  for (const [slot, id] of Object.entries(l.parts)) {
    const def = PARTS[id as string];
    if (!def) { errs.push(`unknown part: ${id}`); continue; }
    if (def.slot !== slot) errs.push(`${id}: slot mismatch (${slot} != ${def.slot})`);
    if (!ACTIVE_SLOTS.includes(slot as SlotKind)) errs.push(`slot inactive: ${slot}`);
    if (def.base && def.base !== l.base) errs.push(`${id}: incompatible with ${l.base}`);
  }
  return errs;
}

/** 새 레이드용 무기 인스턴스(내구도 최대치) */
export function createWeaponState(loadout: Loadout): WeaponState {
  const partDurability: Record<string, number> = {};
  for (const id of Object.values(loadout.parts)) {
    const d = PARTS[id as string];
    if (d?.durable) partDurability[d.id] = d.maxDurability ?? 0;
  }
  return { loadout, baseDurability: BASES[loadout.base].maxDurability, partDurability, charge: 0 };
}

export function isPartActive(state: WeaponState, def: PartDef): boolean {
  return !def.durable || (state.partDurability[def.id] ?? 0) > 0;
}

export interface WeaponStats {
  /** 베이스 내구도 0 → 무기 전체 정지 */
  disabled: boolean;
  stats: Record<string, number>;
  /** 효과가 정지된 부품 id */
  inactiveParts: string[];
}

const isMul = (k: string) => k.endsWith('Mul');

/**
 * 최종 스탯 = (베이스 + Σ add) × Π mul. 내구도 0 부품은 제외.
 * 베이스에 없는 키는 'Mul' 이면 1, 아니면 0 에서 시작.
 */
export function computeStats(state: WeaponState): WeaponStats {
  const base = BASES[state.loadout.base];
  const stats: Record<string, number> = { ...base.stats };
  const inactiveParts: string[] = [];
  const adds: StatMods = {};
  const muls: StatMods = {};

  for (const id of Object.values(state.loadout.parts)) {
    const def = PARTS[id as string];
    if (!def) continue;
    if (!isPartActive(state, def)) { inactiveParts.push(def.id); continue; }
    for (const [k, v] of Object.entries(def.effects.add ?? {})) adds[k] = (adds[k] ?? 0) + v!;
    for (const [k, v] of Object.entries(def.effects.mul ?? {})) muls[k] = (muls[k] ?? 1) * v!;
  }
  for (const k of new Set([...Object.keys(adds), ...Object.keys(muls)])) {
    const start = stats[k] ?? (isMul(k) ? 1 : 0);
    stats[k] = (start + (adds[k] ?? 0)) * (muls[k] ?? 1);
  }
  return { disabled: state.baseDurability <= 0, stats, inactiveParts };
}

/** 내구도 감소 (0 미만으로 내려가지 않음). target: 'base' 또는 partId. 내구도 없는 부품은 무시 */
export function wearDurability(state: WeaponState, target: 'base' | string, amount: number) {
  if (amount <= 0) return;
  if (target === 'base') {
    state.baseDurability = Math.max(0, state.baseDurability - amount);
  } else if (target in state.partDurability) {
    state.partDurability[target] = Math.max(0, state.partDurability[target] - amount);
  }
}

/** 자동 수리(아지트 수리 대체): 전부 최대치로 */
export function repairAll(state: WeaponState) {
  state.baseDurability = BASES[state.loadout.base].maxDurability;
  for (const id of Object.keys(state.partDurability)) state.partDurability[id] = PARTS[id].maxDurability ?? 0;
}
