import { TUNING } from '../config/tuning';
import type { ArmorSystem, DamageSource } from '../core/types';
import { armorStatsOf } from '../hub/gear';
import type { ItemInstance } from '../inventory/grid';

/**
 * 방어구 판정 (순수 로직: 방어구 인스턴스의 내구도만 바꾼다).
 * 피해 종류 → 저항 종류는 TUNING.hub.armor.resistOf. 여러 조각은 곱연산 (1−r₁)(1−r₂).
 * 내구도 0 인 조각은 저항·이동 페널티 모두 정지. 해당 종류 저항이 있는 조각만 받은(경감 전) 피해에 비례해 마모된다.
 */
export function resolveArmorHit(pieces: ItemInstance[], amount: number, source: DamageSource): number {
  const kind = TUNING.hub.armor.resistOf[source];
  if (!kind) return amount;
  let dmg = amount;
  for (const p of pieces) {
    const st = armorStatsOf(p);
    if (st.broken) continue;
    const r = st.resist[kind];
    if (r <= 0) continue;
    dmg *= 1 - r;
    p.dur = Math.max(0, (p.dur ?? 0) - amount * TUNING.hub.armor.wearPerDamage);
  }
  return dmg;
}

export function armorSpeedMul(pieces: ItemInstance[]): number {
  let m = 1;
  for (const p of pieces) { const st = armorStatsOf(p); if (!st.broken) m *= st.speedMul; }
  return Math.max(TUNING.hub.armor.minSpeedMul, m);
}

export function createArmorSystem(pieces: () => ItemInstance[]): ArmorSystem {
  return {
    absorb: (amount, source) => resolveArmorHit(pieces(), amount, source),
    speedMul: () => armorSpeedMul(pieces()),
  };
}
