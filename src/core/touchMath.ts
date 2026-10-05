/**
 * 전력질주 잠금 영역 판정 (순수 함수). dx, dy = 조이스틱 시작점에서 손가락까지의 거리(반경 대비 비율, 화면 y 는 아래가 +).
 * 정면(위) 기준 좌우 coneRad 안이면서 거리가 engage 이상이면 true.
 */
export function inSprintZone(dx: number, dy: number, engage: number, coneRad: number): boolean {
  const up = -dy;
  if (up <= 0) return false;
  return Math.hypot(dx, dy) >= engage && Math.atan2(Math.abs(dx), up) <= coneRad;
}
