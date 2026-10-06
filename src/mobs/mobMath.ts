// 몹 AI 의 순수 로직 (부작용 없음 → 단위 테스트 대상)

export type AttackPhase = 'ready' | 'windup' | 'recover';
export interface AttackState { phase: AttackPhase; t: number }
export interface AttackStep { state: AttackState; /** 이번 프레임에 타격이 확정됨 */ hit: boolean }

export const READY: AttackState = { phase: 'ready', t: 0 };

/**
 * 근접 공격 상태기계: ready →(사거리 진입) windup(예고 동작) →(끝났을 때 아직 사거리 안이면 hit) recover(쿨다운) → ready.
 * 예고(windup) 동안 플레이어가 벗어나면 헛스윙. 입력 상태는 바꾸지 않고 새 상태를 반환한다.
 */
export function stepAttack(s: AttackState, dt: number, inReach: boolean, windup: number, cooldown: number): AttackStep {
  switch (s.phase) {
    case 'ready':
      return { state: inReach ? { phase: 'windup', t: windup } : s, hit: false };
    case 'windup': {
      const t = s.t - dt;
      if (t > 0) return { state: { phase: 'windup', t }, hit: false };
      return { state: { phase: 'recover', t: cooldown }, hit: inReach };
    }
    case 'recover': {
      const t = s.t - dt;
      return { state: t > 0 ? { phase: 'recover', t } : READY, hit: false };
    }
  }
}

/** 수평 단위 방향 (from → to). 거리 0 이면 [0,0] */
export function chaseDir(fromX: number, fromZ: number, toX: number, toZ: number): [number, number] {
  const dx = toX - fromX, dz = toZ - fromZ;
  const d = Math.hypot(dx, dz);
  return d < 1e-6 ? [0, 0] : [dx / d, dz / d];
}

/** 다른 몹과 겹치지 않게 밀어내는 벡터. minDist 안의 이웃만, 가까울수록 강하게 (합산, 정규화 안 함) */
export function separation(selfX: number, selfZ: number, others: [number, number][], minDist: number): [number, number] {
  let px = 0, pz = 0;
  for (const [ox, oz] of others) {
    const dx = selfX - ox, dz = selfZ - oz;
    const d = Math.hypot(dx, dz);
    if (d >= minDist || d < 1e-6) continue;
    const w = (minDist - d) / minDist;
    px += (dx / d) * w;
    pz += (dz / d) * w;
  }
  return [px, pz];
}

/** 목표 방향(yaw)으로 최대 maxStep 만큼만 회전한 새 yaw. 최단 경로(±π 래핑) */
export function turnToward(current: number, target: number, maxStep: number): number {
  let d = target - current;
  d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}
