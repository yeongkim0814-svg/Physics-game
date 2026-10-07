import type { MobDef, MobKind } from '../core/types';
import { TUNING } from '../config/tuning';
import { COL } from '../render/palette';

const M = TUNING.mobs;
const K = M.kinds;

/**
 * 몹 3종. 금속=전도체·전기에 약함, 절연=비전도·전기 피해 작음·물리에 약함, 일반=무특성.
 * 절연체 전기 피해 배율은 코일 튜닝값(insulatorDamageMul)을 그대로 쓴다 (T6 에서 중복 적용 금지).
 */
export const MOBS: Record<MobKind, MobDef> = {
  metal: {
    id: 'metal', name: '금속 몹', maxHp: K.metal.hp, speed: K.metal.speed, meleeDamage: K.metal.damage,
    color: COL.copper, conducts: true, damageMul: { physical: 1, electric: M.metalElectricMul },
  },
  insulator: {
    id: 'insulator', name: '절연 몹', maxHp: K.insulator.hp, speed: K.insulator.speed, meleeDamage: K.insulator.damage,
    color: COL.copperDark, conducts: false, damageMul: { physical: M.insulatorPhysicalMul, electric: TUNING.coil.insulatorDamageMul },
  },
  normal: {
    id: 'normal', name: '일반 몹', maxHp: K.normal.hp, speed: K.normal.speed, meleeDamage: K.normal.damage,
    color: COL.stone, conducts: false, damageMul: { physical: 1, electric: 1 },
  },
};
