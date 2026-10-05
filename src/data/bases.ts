import type { BaseDef, BaseId } from '../core/types';
import { TUNING } from '../config/tuning';

const L = TUNING.launcher;
const C = TUNING.coil;
const P = TUNING.pocketLauncher;
const B = TUNING.blade;
/** 모든 무기 공통 스탯. 'Mul' 키는 기본 1 */
const common = { stability: 0, moveSpeedMul: 1, aimSpeedMul: 1, fovMul: 1 };

export const BASES: Record<BaseId, BaseDef> = {
  momentum_launcher: {
    id: 'momentum_launcher',
    name: '운동량 사출기',
    implemented: true, slotClass: 'primary',
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
    implemented: true, slotClass: 'primary',
    maxDurability: 200,
    stats: {
      ...common,
      chargeTime: C.chargeTime,
      minCharge: C.minCharge,
      overchargeAt: C.overchargeAt,
      overchargeMax: C.overchargeMax,
      maxDamage: C.maxDamage,
      arcRange: C.arcRange,
      spread: C.spread,
      durabilityCostPerShot: C.durabilityCostPerShot,
      chainRadius: C.chainRadius,
      contactRadius: C.contactRadius,
      snapRadius: C.snapRadius,
      chainFalloff: C.chainFalloff,
      chainMaxHops: C.chainMaxHops,
      leakDamageMul: C.leakDamageMul,
      wearOvercharge: C.wearOvercharge,
      waterLeakDps: C.waterLeakDps,
    },
  },
  // --- C·D·E: 데이터 정의 + 아지트 해금 흐름까지. 레이드 동작은 placeholder (이번 범위 밖) ---
  flywheel_accumulator: {
    id: 'flywheel_accumulator', name: '플라이휠 축적기', implemented: false, slotClass: 'primary', maxDurability: 220,
    stats: { ...common, spinUpTime: 3, storedEnergyMax: 100 },
  },
  mass_annihilator: {
    id: 'mass_annihilator', name: '질량 소멸기', implemented: false, slotClass: 'primary', maxDurability: 180,
    stats: { ...common, massToEnergy: 1, beamDamage: 60 },
  },
  tunneling_launcher: {
    id: 'tunneling_launcher', name: '터널링 사출기', implemented: false, slotClass: 'primary', maxDurability: 160,
    stats: { ...common, tunnelProbability: 0.3, projectileSpeed: 60 },
  },
  // --- 보조/근접 무기 (소형 사출기는 운동량 사출기와 같은 동작을 작게, 충격 블레이드는 근접 타격) ---
  pocket_launcher: {
    id: 'pocket_launcher', name: '소형 사출기', implemented: true, slotClass: 'secondary', maxDurability: 120,
    stats: {
      ...common,
      projectileSpeed: L.projectileSpeed * P.projectileSpeedMul,
      recoil: P.recoilMul,
      spreadBase: L.spread.base * P.spreadMul,
      spreadPerShot: L.spread.perShot,
      spreadRecover: L.spread.recover,
      fireInterval: L.fireInterval * P.fireIntervalMul,
      materialsPerShot: L.materialsPerShot,
      durabilityCostPerShot: L.durabilityCostPerShot,
      wearPerRecoil: L.wearPerRecoil,
    },
  },
  impact_blade: {
    id: 'impact_blade', name: '충격 블레이드', implemented: true, slotClass: 'melee', maxDurability: 150,
    stats: { ...common, meleeDamage: B.damage, meleeReach: B.reach, meleeInterval: B.interval, durabilityCostPerShot: B.durabilityCost },
  },
};
