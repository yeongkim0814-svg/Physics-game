// 시스템 간 계약(contract).
import type * as THREE from 'three';

export type MobKind = 'metal' | 'insulator' | 'normal';

/** 플레이어/몹/구조물이 전기·피해를 받는 공통 인터페이스 */
export interface Damageable {
  readonly position: THREE.Vector3;
  /** 투사체 판정 반경(m). 없으면 피격 불가 */
  readonly hitRadius?: number;
  takeDamage(amount: number, source: DamageSource): void;
}
export type DamageSource = 'physical' | 'electric' | 'fall' | 'leak';

/** 전도체 노드: 연쇄 계산 대상 (금속 몹, 금속 구조물, 물웅덩이 등) */
export interface Conductor {
  readonly position: THREE.Vector3;
  readonly kind: 'metal_mob' | 'metal_structure' | 'water' | 'player' | 'ally' | 'insulator_mob' | 'normal_mob';
  /** 전파 가능 여부. insulator_mob 은 false */
  readonly conducts: boolean;
  /** 이 반경 안의 다른 전도체로 전파 */
  readonly radius: number;
  shock(damage: number): void;
}

/** 반동 임펄스를 받을 수 있는 대상(플레이어) */
export interface ImpulseTarget {
  applyImpulse(impulse: THREE.Vector3): void;
}

export interface MobDef {
  id: MobKind;
  name: string;
  maxHp: number;
  speed: number;
  meleeDamage: number;
  color: number;
  /** 전기를 전파하는가 (금속만 true) */
  conducts: boolean;
  /** 받는 피해 배율 */
  damageMul: Record<'physical' | 'electric', number>;
}

/** 돌을 던지는 쪽(플레이어)이 제공하는 최소 정보 */
export interface ThrowSource {
  eyePosition(out?: THREE.Vector3): THREE.Vector3;
  aimDirection(out?: THREE.Vector3): THREE.Vector3;
  readonly velocity: THREE.Vector3;
}
