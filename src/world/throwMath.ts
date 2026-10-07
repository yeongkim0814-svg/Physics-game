// 돌 던지기 순수 함수 (THREE/Rapier 의존 없음 → 단위 테스트 대상)

export interface V3 { x: number; y: number; z: number }

/** 던진 돌의 초기 속도 = 시선 방향 * 초속 + 플레이어 속도 * 승계 비율 */
export function throwVelocity(dir: V3, speed: number, carrier: V3, inherit: number): V3 {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return {
    x: (dir.x / len) * speed + carrier.x * inherit,
    y: (dir.y / len) * speed + carrier.y * inherit,
    z: (dir.z / len) * speed + carrier.z * inherit,
  };
}

export interface CullState { age: number; y: number; landedFor: number | null }
export interface CullRules { maxAge: number; voidY: number; settledLife: number }
export type CullReason = 'age' | 'void' | 'settled';

/** 치울 돌인가: 맵 아래로 추락 / 너무 오래됨 / 착지 후 오래 방치 */
export function cullReason(s: CullState, r: CullRules): CullReason | null {
  if (s.y < r.voidY) return 'void';
  if (s.age >= r.maxAge) return 'age';
  if (s.landedFor !== null && s.landedFor >= r.settledLife) return 'settled';
  return null;
}

/** 새 돌 하나를 더 만들 자리를 비우려면 치워야 할 돌의 인덱스 (가장 오래된 순). ages[i] 가 클수록 오래됨 */
export function evictForRoom(ages: readonly number[], maxActive: number): number[] {
  const over = ages.length - (maxActive - 1);
  if (over <= 0) return [];
  return ages.map((a, i) => [a, i] as const).sort((p, q) => q[0] - p[0]).slice(0, over).map(([, i]) => i);
}

/** 던지기 쿨다운: 남은 시간 갱신 */
export function tickCooldown(remaining: number, dt: number): number {
  return Math.max(0, remaining - dt);
}

/** 이상적인 자유낙하 시간 (공기저항 없음): h = g t² / 2 */
export function freeFallTime(height: number, gravity: number): number {
  return height > 0 ? Math.sqrt((2 * height) / gravity) : 0;
}
