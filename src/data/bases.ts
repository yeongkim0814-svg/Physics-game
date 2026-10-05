import type { BaseDef, BaseId } from '../core/types';
import { TUNING } from '../config/tuning';

const L = TUNING.launcher;
const C = TUNING.coil;
/** 모든 무기 공통 스탯. 'Mul' 키는 기본 1 */
const common = { stability: 0, moveSpeedMul: 1, aimSpeedMul: 1, fovMul: 1 };

export const BASES: Record<BaseId, BaseDef> = {
  momentum_launcher: {
    id: 'momentum_launcher',
    name: '운동량 사출기',
    maxDurability: 200,
    stats: {
      ...common,
      projectileSpeed: L.projectileSpeed,
      recoil: 1, // 배율(부품이 곱함). 절대 세기는 TUNING.launcher.recoilScale
      spreadBase: L.spread.base,
      spreadPerShot: L.spread.perShot,
      spreadRecover: L.spread.recover,
      fireInterval: L.fireInterval,
      materialsPerShot: L.materialsPerShot,
      durabilityCostPerShot: L.durabilityCostPerShot,
      wearPerRecoil: L.wearPerRecoil,
    },
  },
  em_coil: {
    id: 'em_coil',
    name: '전자기 코일',
    maxDurability: 200,
    stats: {
      ...common,
      chargeTime: C.chargeTime,
      maxDamage: C.maxDamage,
      arcRange: C.arcRange,
      spread: C.spread,
      chainRadius: C.chainRadius,
      chainFalloff: C.chainFalloff,
      chainMaxHops: C.chainMaxHops,
      leakDamageMul: C.leakDamageMul,
      wearOvercharge: C.wearOvercharge,
    },
  },
};
