// 시스템 간 이벤트 (구체 클래스 직접 의존 대신 이쪽으로 알린다). 구독 해제 함수를 돌려준다.

export type StoneKind = 'light' | 'heavy';

/** 던진/놓은 돌의 식별 정보 (이벤트로 내보내는 읽기 전용 스냅샷) */
export interface StoneInfo {
  readonly id: number;
  readonly kind: StoneKind;
  readonly mass: number;
  readonly radius: number;
}

export class Emitter<A extends unknown[]> {
  private listeners = new Set<(...args: A) => void>();
  on(fn: (...args: A) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(...args: A) { for (const fn of [...this.listeners]) fn(...args); }
}

export const gameEvents = {
  /**
   * 돌이 처음 지면/구조물에 닿았을 때. tSec = 놓은 순간부터 착지까지 시뮬레이션 시간(초),
   * dropHeight = 놓은 순간 돌 바닥 높이 - 착지 순간 돌 바닥 높이(m). 증거 카드(M1c)가 쓴다.
   */
  onLanded: new Emitter<[stone: StoneInfo, tSec: number, dropHeight: number]>(),
};
