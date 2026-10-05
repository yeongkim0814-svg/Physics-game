// 터치 입력의 순수 판정 로직 (DOM 없음 → 단위 테스트 대상)

export interface SprintCfg {
  /** y 가 이 값 이상이면 전력질주 */
  start: number;
  /** 전력질주 중 y 가 이 값 이상까지 가면 "자동 전력질주 대기" (이때 손을 떼면 자동 전력질주) */
  auto: number;
  /** 경계 떨림 방지: 전력질주 중에는 start - hysteresis 아래로 내려가야 해제 */
  hysteresis: number;
}
export interface SprintState {
  /** 손가락이 눌린 동안의 전력질주 */
  sprinting: boolean;
  /** auto 에 도달한 적이 있고 아직 start 아래로 내려가지 않음 → 손을 떼면 자동 전력질주 */
  armed: boolean;
}
export const SPRINT_IDLE: SprintState = { sprinting: false, armed: false };

/**
 * 조이스틱을 누르고 있는 동안 y(조이스틱 시작점 기준 위쪽 변위, 반경 대비, 위가 +)로 전력질주 상태를 갱신한다.
 *  - y ≥ start 가 되는 순간 전력질주. 손을 떼지 않고 start 아래로 내리면 해제(+대기도 해제)
 *  - 전력질주 중 y ≥ auto 에 닿으면 armed. armed 는 start 아래로 내려가기 전까지 유지(손 뗄 때 y 가 살짝 줄어도 인정)
 */
export function stepSprint(s: SprintState, y: number, c: SprintCfg): SprintState {
  const sprinting = s.sprinting ? y >= c.start - c.hysteresis : y >= c.start;
  const armed = sprinting && (s.armed || y >= c.auto);
  return { sprinting, armed };
}

/** 손을 뗄 때 자동 전력질주로 이어지는가 */
export function autoSprintOnRelease(s: SprintState): boolean {
  return s.sprinting && s.armed;
}

export interface Pt { x: number; y: number }

/**
 * 놓친 pointerup 복구: 추적 중인 포인터(tracked) 중 화면에 실제로 닿아 있는 손가락(live)과 짝이 없는 것의 id 를 돌려준다.
 * 가까운 순으로 1:1 로 짝지으며, 거리가 tol 이내여야 짝으로 인정한다. live 가 비어 있으면 전부 반환.
 */
export function stalePointerIds(tracked: Map<number, Pt>, live: Pt[], tol: number): number[] {
  const pairs: { id: number; li: number; d: number }[] = [];
  for (const [id, p] of tracked) {
    live.forEach((l, li) => {
      const d = Math.hypot(p.x - l.x, p.y - l.y);
      if (d <= tol) pairs.push({ id, li, d });
    });
  }
  pairs.sort((a, b) => a.d - b.d);
  const usedIds = new Set<number>();
  const usedLive = new Set<number>();
  for (const pr of pairs) {
    if (usedIds.has(pr.id) || usedLive.has(pr.li)) continue;
    usedIds.add(pr.id);
    usedLive.add(pr.li);
  }
  return [...tracked.keys()].filter((id) => !usedIds.has(id));
}

/** 원형 버튼 적중 판정 (여유 slop 포함). 가장 가까운 버튼의 키를 반환, 없으면 null */
export function hitCircle<K extends string>(
  x: number, y: number, circles: { key: K; cx: number; cy: number; r: number }[], slop: number,
): K | null {
  let best: K | null = null;
  let bestD = Infinity;
  for (const c of circles) {
    const d = Math.hypot(x - c.cx, y - c.cy);
    if (d <= c.r + slop && d < bestD) { bestD = d; best = c.key; }
  }
  return best;
}
