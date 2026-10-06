import type { Input } from '../core/input';

/** 플레이어가 들고 있는 무기. GameLoop 는 이 인터페이스로만 다룬다 */
export interface Weapon {
  readonly name: string;
  update(dt: number, input: Input): void;
  /** HUD 에 표시할 줄 (무기별 상태: 충전량/퍼짐 등) */
  hudLines(): string[];
  /** 무기를 바꿀 때 진행 중인 동작(충전 등)을 취소 */
  reset(): void;
}
