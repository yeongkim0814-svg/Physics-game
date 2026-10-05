// 시스템 간 계약(contract). 이 파일 변경은 Claude 소유 — 변경 필요 시 docs/TASKS.md '계약 변경 요청'에 적을 것.
import type * as THREE from 'three';

export type SlotKind = 'front' | 'rear' | 'top' | 'sub';
export type BaseId = 'momentum_launcher' | 'em_coil';
export type MobKind = 'metal' | 'insulator' | 'normal';

/** 모든 수치 보정은 스탯 키-값으로 합산된다. 키 목록은 config/stats.ts 참고. */
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
