// 터치 입력의 순수 판정 로직 (DOM 없음 → 단위 테스트 대상)

/**
 * 전력질주 잠금 아이콘 판정. dx, dy = 조이스틱 시작점에서 손가락까지의 거리(반경 대비 비율, 화면 y 는 아래가 +).
 * 아이콘은 시작점 바로 위 engage 거리에 있고, 손가락이 아이콘 반경(iconRadius, 같은 비율 단위) 안에 들어오면 true.
 */
export function inSprintIcon(dx: number, dy: number, engage: number, iconRadius: number): boolean {
  return Math.hypot(dx, dy + engage) <= iconRadius;
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
