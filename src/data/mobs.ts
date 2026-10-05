import type { MobDef, MobKind } from '../core/types';
import { TUNING } from '../config/tuning';

const M = TUNING.mobs;

export const MOBS: Record<MobKind, MobDef> = {
  metal: {
    id: 'metal', name: '금속 몹', maxHp: M.hp, speed: M.speed, meleeDamage: M.meleeDamage,
    color: 0x9aa5b1, conducts: true, damageMul: { physical: 1, electric: M.metalElectricMul },
  },
  insulator: {
    id: 'insulator', name: '절연 몹', maxHp: M.hp, speed: M.speed, meleeDamage: M.meleeDamage,
    color: 0xc98a3a, conducts: false, damageMul: { physical: M.insulatorPhysicalMul, electric: 1 },
  },
  normal: {
    id: 'normal', name: '일반 몹', maxHp: M.hp, speed: M.speed, meleeDamage: M.meleeDamage,
    color: 0xb04a4a, conducts: false, damageMul: { physical: 1, electric: 1 },
  },
};
