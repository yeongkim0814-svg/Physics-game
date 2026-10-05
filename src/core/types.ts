// 시스템 간 계약(contract). 시스템 간 계약.
import type * as THREE from 'three';

export type SlotKind = 'front' | 'rear' | 'top' | 'sub';
/** A·B 는 레이드에서 동작. C·D·E 는 데이터/허브 해금 흐름만 있고 레이드에서는 placeholder (BaseDef.implemented) */
export type BaseId =
  | 'momentum_launcher' | 'em_coil'
  | 'flywheel_accumulator' | 'mass_annihilator' | 'tunneling_launcher'
  | 'pocket_launcher' | 'impact_blade';
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
  /** false 면 레이드에서 placeholder 무기로 대체된다 (이번 범위 밖) */
  implemented: boolean;
  /** 들어가는 무기 칸 분류 */
  slotClass: import('../data/weaponSlots').SlotClass;
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
  /** 연구대 개량이 더하는 스탯 보정 (베이스+활성 부품 개량 합산). computeStats 가 부품 효과와 같은 식으로 합산 */
  bonus?: { add?: StatMods; mul?: StatMods };
}

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

/** 플레이어가 입은 방어구(레이드 중 저항·이동속도 페널티·마모). 피해는 종류별 저항으로 줄고 방어구 내구도가 닳는다 */
export interface ArmorSystem {
  /** 경감 후 피해를 돌려주고 방어구를 마모시킨다 */
  absorb(amount: number, source: DamageSource): number;
  /** 이동속도 배율 (파손된 방어구는 효과 정지) */
  speedMul(): number;
}

/** 반동 임펄스를 받을 수 있는 대상(플레이어) */
export interface ImpulseTarget {
  applyImpulse(impulse: THREE.Vector3): void;
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
  /** 사망 시 드롭 {재료: [최소, 최대]} */
  drop: Record<string, [number, number]>;
}

/** 사출기가 소모하는 재료(덩어리). 질량이 클수록 위력·반동이 크다 */
export interface MaterialDef {
  id: string;
  name: string;
  /** 덩어리 1개 질량 (kg) */
  mass: number;
  color: number;
}
