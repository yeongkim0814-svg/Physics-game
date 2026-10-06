// 도달성 검사 (순수 함수): 걸어서(최대 단차 이하) 갈 수 있는 칸을 스폰에서 flood-fill 한다.
// 표면 높이 = max(하이트필드 윗면, 박스 윗면) — 탑·폐허·계단·다리 상판 같은 기존 게임플레이 박스를 포함한다.
// 층 단차(3m)는 막히고, 램프 회랑(칸당 ≤0.4m)·계단(0.4m)은 통과한다. 지붕 아래 통로(다리 아래)는 2.5D 라 표면 하나로 단순화한다.
import type { TerrainField } from './terrainField';

export interface WalkBox { pos: readonly [number, number, number]; size: readonly [number, number, number] }
export interface WalkGrid { half: number; cell: number; n: number; h: Float32Array }

/** 표본 위치를 칸 중심에서 살짝 비껴 박스 모서리(0.1m 배수)와 정확히 겹치는 부동소수 오차를 피한다 */
const JITTER = 0.07;

/** 반폭 half 안을 cell 간격으로 표본한 표면 높이 격자 */
export function buildWalkGrid(field: TerrainField, boxes: readonly WalkBox[], half: number, cell: number): WalkGrid {
  const n = Math.round((2 * half) / cell);
  const h = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) h[iz * n + ix] = field.surface(-half + (ix + 0.5) * cell + JITTER, -half + (iz + 0.5) * cell + JITTER);
  for (const b of boxes) {
    const top = b.pos[1] + b.size[1] / 2;
    const x0 = Math.max(0, Math.ceil((b.pos[0] - b.size[0] / 2 + half - JITTER) / cell - 0.5)), x1 = Math.min(n - 1, Math.floor((b.pos[0] + b.size[0] / 2 + half - JITTER) / cell - 0.5));
    const z0 = Math.max(0, Math.ceil((b.pos[2] - b.size[2] / 2 + half - JITTER) / cell - 0.5)), z1 = Math.min(n - 1, Math.floor((b.pos[2] + b.size[2] / 2 + half - JITTER) / cell - 0.5));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) if (top > h[iz * n + ix]) h[iz * n + ix] = top;
  }
  return { half, cell, n, h };
}

export const cellIndex = (g: WalkGrid, x: number, z: number) => {
  const ix = Math.floor((x + g.half) / g.cell), iz = Math.floor((z + g.half) / g.cell);
  return ix < 0 || iz < 0 || ix >= g.n || iz >= g.n ? -1 : iz * g.n + ix;
};

/** start 칸에서 4방향으로, 인접 칸 높이 차 ≤ maxStep 이면 걸어갈 수 있다. 도달한 칸 = 1 */
export function floodReachable(g: WalkGrid, start: readonly [number, number], maxStep: number): Uint8Array {
  const seen = new Uint8Array(g.n * g.n), stack: number[] = [];
  const s = cellIndex(g, start[0], start[1]);
  if (s < 0) return seen;
  seen[s] = 1; stack.push(s);
  while (stack.length) {
    const i = stack.pop()!;
    const ix = i % g.n, iz = (i - ix) / g.n;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= g.n || jz >= g.n) continue;
      const j = jz * g.n + jx;
      if (!seen[j] && Math.abs(g.h[j] - g.h[i]) <= maxStep) { seen[j] = 1; stack.push(j); }
    }
  }
  return seen;
}

/** 점 (x,z) 가 도달한 칸인가 */
export function reached(g: WalkGrid, seen: Uint8Array, x: number, z: number) {
  const i = cellIndex(g, x, z);
  return i >= 0 && seen[i] === 1;
}
