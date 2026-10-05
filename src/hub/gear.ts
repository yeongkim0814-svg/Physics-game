import type { SlotKind, StatMods, WeaponState } from '../core/types';
import { BASES } from '../data/bases';
import { PARTS } from '../data/parts';
import { ARMORS, type ArmorDef, type ResistKind, RESIST_KINDS } from '../data/armors';
import { UPGRADES, UPGRADE_BY_ID } from '../data/upgrades';
import { itemDef } from '../data/items';
import { TUNING } from '../config/tuning';
import { computeStats, ACTIVE_SLOTS } from '../data/loadout';
import { newInstance, type ItemInstance } from '../inventory/grid';

/** 무기·방어구 인스턴스 ↔ 레이드/스탯 계산 변환 (순수 함수). 개량 레벨은 inst.lv 에 저장 */

export const isWeaponBase = (i: ItemInstance) => itemDef(i.defId).kind === 'weapon_base';
export const isPart = (i: ItemInstance) => itemDef(i.defId).kind === 'weapon_part';
export const isArmor = (i: ItemInstance) => itemDef(i.defId).kind === 'armor';

/** 종류에 맞는 기본값(내구도 최대치 등)을 채운 새 아이템 */
export function createItem(defId: string, count = 1, extra: Partial<ItemInstance> = {}): ItemInstance {
  const d = itemDef(defId);
  const inst = newInstance(defId, count, extra);
  // 스택 한도를 넘는 수량도 만들 수 있다 (격자에 넣을 때 addItem 이 여러 칸으로 쪼갠다)
  inst.count = d.stack > 1 ? Math.max(1, Math.floor(count)) : 1;
  if (d.kind === 'weapon_base') inst.dur = BASES[defId as keyof typeof BASES].maxDurability;
  else if (d.kind === 'weapon_part' && PARTS[defId].durable) inst.dur = PARTS[defId].maxDurability ?? 0;
  else if (d.kind === 'armor') inst.dur = ARMORS[defId].maxDurability;
  return inst;
}

export const levelOf = (i: ItemInstance, upgradeId: string) => i.lv?.[upgradeId] ?? 0;

/** 레벨 누적: add 는 레벨 배, mul 은 레벨 제곱 */
function accumulate(add: StatMods, mul: StatMods, perLevel: { add?: StatMods; mul?: StatMods }, level: number) {
  for (const [k, v] of Object.entries(perLevel.add ?? {})) add[k] = (add[k] ?? 0) + v! * level;
  for (const [k, v] of Object.entries(perLevel.mul ?? {})) mul[k] = (mul[k] ?? 1) * Math.pow(v!, level);
}

/** 베이스 개량 + (작동 중인) 장착 부품 개량의 스탯 보정 합 */
export function weaponBonus(inst: ItemInstance): { add: StatMods; mul: StatMods } {
  const add: StatMods = {}, mul: StatMods = {};
  for (const u of UPGRADES) {
    if (u.target === 'weapon' && u.perLevel && u.appliesTo.includes(inst.defId)) accumulate(add, mul, u.perLevel, levelOf(inst, u.id));
  }
  for (const part of Object.values(inst.parts ?? {})) {
    if (!part || (PARTS[part.defId].durable && (part.dur ?? 0) <= 0)) continue;
    for (const u of UPGRADES) {
      if (u.target === 'part' && u.perLevel && u.appliesTo.includes(part.defId)) accumulate(add, mul, u.perLevel, levelOf(part, u.id));
    }
  }
  return { add, mul };
}

/** 인스턴스 → 레이드/계산용 WeaponState. withUpgrades=false 면 개량 무시(비교용) */
export function weaponStateOf(inst: ItemInstance, withUpgrades = true): WeaponState {
  const parts: Partial<Record<SlotKind, string>> = {};
  const partDurability: Record<string, number> = {};
  for (const [slot, p] of Object.entries(inst.parts ?? {})) {
    if (!p) continue;
    parts[slot as SlotKind] = p.defId;
    if (PARTS[p.defId].durable) partDurability[p.defId] = p.dur ?? 0;
  }
  return {
    loadout: { base: inst.defId as WeaponState['loadout']['base'], parts },
    baseDurability: inst.dur ?? BASES[inst.defId as keyof typeof BASES].maxDurability,
    partDurability, charge: 0,
    bonus: withUpgrades ? weaponBonus(inst) : undefined,
  };
}

/** 레이드 후 마모를 인스턴스에 반영 */
export function writeBackWeapon(inst: ItemInstance, state: WeaponState) {
  inst.dur = state.baseDurability;
  for (const p of Object.values(inst.parts ?? {})) {
    if (p && p.defId in state.partDurability) p.dur = state.partDurability[p.defId];
  }
}

export const weaponStats = (inst: ItemInstance, withUpgrades = true) => computeStats(weaponStateOf(inst, withUpgrades));

/** 부품 장착 가능성 검사: 오류 메시지 또는 null */
export function attachError(weapon: ItemInstance, part: ItemInstance): string | null {
  if (!isWeaponBase(weapon) || !isPart(part)) return '장착 대상이 아님';
  const def = PARTS[part.defId];
  if (def.base && def.base !== weapon.defId) return `${BASES[def.base].name} 전용 부품`;
  if (!ACTIVE_SLOTS.includes(def.slot)) return '이번 범위에서 비활성 슬롯';
  return null;
}

/** 부품을 장착하고, 이미 있던 부품이 있으면 반환(교체) */
export function attachPart(weapon: ItemInstance, part: ItemInstance): ItemInstance | undefined {
  const slot = PARTS[part.defId].slot;
  const old = weapon.parts?.[slot];
  weapon.parts = { ...(weapon.parts ?? {}), [slot]: part };
  return old;
}
export function detachPart(weapon: ItemInstance, slot: SlotKind): ItemInstance | undefined {
  const old = weapon.parts?.[slot];
  if (old && weapon.parts) { delete weapon.parts[slot]; if (!Object.keys(weapon.parts).length) delete weapon.parts; }
  return old;
}

// ---------------- 방어구 ----------------
export interface ArmorStats {
  resist: Record<ResistKind, number>;
  speedMul: number;
  maxDurability: number;
  /** 내구도 0: 저항·페널티 모두 정지 */
  broken: boolean;
}

/** 방어구 개량 합산(저항 0~0.9 로 제한, 이동속도 하한은 TUNING.hub.armor.minSpeedMul) */
export function armorStatsOf(inst: ItemInstance): ArmorStats {
  const def: ArmorDef = ARMORS[inst.defId];
  const resist = { ...def.resist };
  let speedMul = def.speedMul, maxDurability = def.maxDurability;
  for (const u of UPGRADES) {
    if (u.target !== 'armor' || !u.armorPerLevel) continue;
    if (u.appliesTo.length && !u.appliesTo.includes(inst.defId)) continue;
    const lv = levelOf(inst, u.id);
    for (const k of RESIST_KINDS) resist[k] += (u.armorPerLevel.resist?.[k] ?? 0) * lv;
    speedMul += (u.armorPerLevel.speedMul ?? 0) * lv;
    maxDurability += (u.armorPerLevel.maxDurability ?? 0) * lv;
  }
  for (const k of RESIST_KINDS) resist[k] = Math.min(0.9, Math.max(0, resist[k]));
  speedMul = Math.max(TUNING.hub.armor.minSpeedMul, Math.min(1, speedMul));
  return { resist, speedMul, maxDurability, broken: (inst.dur ?? 0) <= 0 };
}

/** 개량 적용 가능 여부(대상 종류·defId) */
export function upgradeApplies(upgradeId: string, inst: ItemInstance): boolean {
  const u = UPGRADE_BY_ID[upgradeId];
  const kind = itemDef(inst.defId).kind;
  const target = kind === 'weapon_base' ? 'weapon' : kind === 'weapon_part' ? 'part' : kind === 'armor' ? 'armor' : null;
  if (u.target !== target) return false;
  return u.appliesTo.length === 0 || u.appliesTo.includes(inst.defId);
}

/** 이 아이템의 최대 내구도 (개량 포함) */
export function maxDurOf(inst: ItemInstance): number | null {
  const k = itemDef(inst.defId).kind;
  if (k === 'weapon_base') return BASES[inst.defId as keyof typeof BASES].maxDurability;
  if (k === 'weapon_part') return PARTS[inst.defId].durable ? PARTS[inst.defId].maxDurability ?? 0 : null;
  if (k === 'armor') return armorStatsOf(inst).maxDurability;
  return null;
}

/** 수리 대상 구성요소: 아이템 자신 + 장착 부품. [인스턴스, 최대치] */
export function durableParts(inst: ItemInstance): { inst: ItemInstance; max: number; label: string }[] {
  const out: { inst: ItemInstance; max: number; label: string }[] = [];
  const own = maxDurOf(inst);
  if (own !== null) out.push({ inst, max: own, label: itemDef(inst.defId).name });
  for (const p of Object.values(inst.parts ?? {})) {
    const m = p ? maxDurOf(p) : null;
    if (p && m !== null) out.push({ inst: p, max: m, label: itemDef(p.defId).name });
  }
  return out;
}

/** 수리 비용: 부족한 내구도 durPerScrap 당 고철 1. 파손(0)은 추가 재료. 수리할 게 없으면 null */
export function repairCost(inst: ItemInstance): Record<string, number> | null {
  const R = TUNING.hub.repair;
  let missing = 0, broken = 0;
  for (const c of durableParts(inst)) {
    const m = c.max - (c.inst.dur ?? 0);
    if (m > 1e-6) { missing += m; if ((c.inst.dur ?? 0) <= 0) broken++; }
  }
  if (missing <= 0) return null;
  const cost: Record<string, number> = { scrap: Math.ceil(missing / R.durPerScrap) };
  if (broken > 0) for (const [id, n] of Object.entries(R.brokenSurcharge)) cost[id] = (cost[id] ?? 0) + n * broken;
  return cost;
}

export function repairItem(inst: ItemInstance) {
  for (const c of durableParts(inst)) c.inst.dur = c.max;
}

/** 내구도가 하나라도 0 인가 (장착 무기 경고용) */
export const hasBroken = (inst: ItemInstance) => durableParts(inst).some((c) => (c.inst.dur ?? 0) <= 0);
