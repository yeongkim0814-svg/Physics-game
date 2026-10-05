import type { PartDef } from '../core/types';

/** 부품 정의. effects.add 는 가산, effects.mul 은 승수. 수치는 임의 시작값. */
export const PARTS: Record<string, PartDef> = {
  handle: {
    id: 'handle', name: '손잡이', slot: 'rear', // 공통: 안정성↑ 이동↓
    effects: { add: { stability: 0.5 }, mul: { moveSpeedMul: 0.92 } },
    durable: false,
  },
  scope: {
    id: 'scope', name: '조준기', slot: 'top', // 공통: 조준 속도↑ 시야↓
    effects: { mul: { aimSpeedMul: 1.4, fovMul: 0.75 } },
    durable: false,
  },
  damping_spring: {
    id: 'damping_spring', name: '감쇠 스프링', slot: 'rear', base: 'momentum_launcher', // 반동↓ 사출 속도↓
    effects: { mul: { recoil: 0.6, projectileSpeed: 0.85 } },
    durable: true, maxDurability: 60, wearRate: 1,
  },
  focus_coil: {
    id: 'focus_coil', name: '집속 코일', slot: 'front', base: 'em_coil', // 사거리·정밀↑ 충전 시간↑
    effects: { add: { arcRange: 10 }, mul: { spread: 0.5, chargeTime: 1.4 } },
    durable: true, maxDurability: 80, wearRate: 1,
  },
  insulated_sheath: {
    id: 'insulated_sheath', name: '절연 피복', slot: 'rear', base: 'em_coil', // 누전 피해↓ 연쇄 범위↓
    effects: { mul: { leakDamageMul: 0.4, chainRadius: 0.7 } },
    durable: true, maxDurability: 60, wearRate: 1,
  },
};
