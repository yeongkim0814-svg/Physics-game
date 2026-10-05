// 시스템 간 계약(contract). 시스템 간 계약.
import type * as THREE from 'three';

export type SlotKind = 'front' | 'rear' | 'top' | 'sub';
export type BaseId = 'momentum_launcher' | 'em_coil';
export type MobKind = 'metal' | 'insulator' | 'normal';

/** 모든 수치 보정은 스탯 키-값으로 합산된다. 키 목록은 data/bases.ts 참고. 'Mul' 로 끝나는 키는 기본값 1, 나머지는 0. */
export type StatMods = Partial<Record<string, number>>;

export interface PartDef {
  id: string;
  name: string;
  slot: SlotKind;
  /** 호환 베이스. 생략 시 공통 */
  base?: BaseId;
  /** 가산(add) / 승수(mul) 효과. 예: { recoilMul: 0.6 } */
  effects: { add?: StatMods; mul?: StatMods };
  durable: boolean;
  maxDurability?: number;
  /** 사용 부하당 마모량 배율 */
  wearRate?: number;
}

export interface BaseDef {
  id: BaseId;
  name: string;
  maxDurability: number;
  stats: Record<string, number>;
}

export interface Loadout {
  base: BaseId;
  parts: Partial<Record<SlotKind, string>>; // slot -> partId
}

/** 무기 런타임 인스턴스: 내구도는 개별 추적 */
export interface WeaponState {
  loadout: Loadout;
  baseDurability: number;
  partDurability: Record<string, number>; // partId -> 현재 내구도
  charge: number; // 0..1 (코일)
}

/** 플레이어/몹/구조물이 전기·피해를 받는 공통 인터페이스 */
export interface Damageable {
  readonly position: THREE.Vector3;
  /** 투사체 판정 반경(m). 없으면 피격 불가 */
  readonly radius?: number;
  takeDamage(amount: number, source: DamageSource): void;
}
export type DamageSource = 'physical' | 'electric' | 'fall' | 'leak';

/** 전도체 노드: 연쇄 계산 대상 (금속 몹, 금속 구조물, 물웅덩이 등) */
export interface Conductor {
  readonly position: THREE.Vector3;
  readonly kind: 'metal_mob' | 'metal_structure' | 'water' | 'player' | 'ally' | 'insulator_mob';
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

/** 영속 데이터 — 레이드 간 유지되는 것 */
export interface Persistent {
  stash: { weapons: Loadout[]; materials: Record<string, number> }; // 안전 보관함(사망해도 유지)
  carried: { weapons: Loadout[]; materials: Record<string, number> }; // 소지품(사망 시 손실)
}

export type RaidResult = 'extracted' | 'dead';

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

/** 사출기가 소모하는 재료(덩어리). 질량이 클수록 위력·반동이 크다 */
export interface MaterialDef {
  id: string;
  name: string;
  /** 덩어리 1개 질량 (kg) */
  mass: number;
  color: number;
}
