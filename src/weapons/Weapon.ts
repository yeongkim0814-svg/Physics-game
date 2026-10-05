import type { Input } from '../core/input';
import type { WeaponState } from '../core/types';

/** 레이드에서 장착한 무기(베이스별 구현). RaidLoop 는 이 인터페이스로만 다룬다 */
export interface Weapon {
  state: WeaponState;
  update(dt: number, input: Input): void;
  /** HUD 에 표시할 줄 (무기별 상태: 재료/충전량/퍼짐 등) */
  hudLines(): string[];
}
