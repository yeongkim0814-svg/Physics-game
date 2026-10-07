// 삼각 분할 패치 (그래픽: 사각 타일 모자이크 → 불규칙한 삼각형 면). 순수 계산 (THREE 의존 없음).
// 직사각형 면을 nu×nv 격자로 나누고, **안쪽 정점만** 면내로 흔들고(jitter) 법선 방향으로 변위(bump)시킨다.
// 가장자리 정점은 그대로라 이웃 면과 균열이 생기지 않고, 충돌과 맞아야 하는 면은 bump 를 0 으로 두면 평평하게 유지된다.
// 셀마다 대각선 방향을 무작위로 뒤집고, 삼각형마다 독립된 색(+미세 명도)을 입혀 삼각형 패싯이 읽히게 한다.

export type V3 = [number, number, number];

/** 정수 3개 + 시드 → 0~1 (결정적 해시) */
export function hash3(a: number, b: number, c: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** 삼각 분할 외형 수치 (VISUAL.lowpoly.terrain.facet) */
export interface FacetLook {
  /** 안쪽 정점의 면내 흔들림 (셀 크기 비) */
  jitter: number;
  /** 측면(절벽·건물 벽)이 안쪽으로 패이는 최대 깊이 (셀 최소 변 비) */
  sideIn: number;
  /** 걸을 수 없는 윗면의 상하 기복 (셀 최소 변 비)과 상한(m) */
  topLift: number; topLiftMax: number;
  /** 삼각형별 명도 ± 비율 */
  triShade: number;
  /** 한 변이 이 길이(m) 이상이면 안쪽 정점이 생기도록 최소 2분할: 측면(절벽·벽) / 윗면 */
  minSplit: number; minSplitTop: number;
  /** 이 반경(m) 밖은 안개에 묻히므로 최소 분할을 적용하지 않는다 (삼각형 절감, 하이트필드 전용) */
  range: number;
}

export const FACET_DEFAULT: FacetLook = { jitter: 0.3, sideIn: 0.38, topLift: 0.2, topLiftMax: 2.2, triShade: 0.08, minSplit: 3.5, minSplitTop: 4, range: 220 };

/** 면 길이를 분할 수로 (1 ≤ n ≤ maxTiles). minSplit 이상이면 최소 2 (안쪽 정점 확보) */
export function splitCount(len: number, tile: number, maxTiles: number, minSplit: number): number {
  const n = Math.min(maxTiles, Math.max(1, Math.ceil(len / Math.max(1e-3, tile) - 1e-6)));
  return n < 2 && len >= minSplit && maxTiles >= 2 ? 2 : n;
}

export interface FacetPatch {
  origin: V3; u: V3; v: V3; uLen: number; vLen: number; nu: number; nv: number;
  /** 면 바깥 법선 (삼각형 법선은 이쪽을 향하도록 정렬) */
  n: V3;
  seed: number;
  /** (삼각형 쌍 인덱스) → 기준색. i = 2·셀i + (0|1) 로 삼각형마다 따로 부른다 */
  colorAt: (i: number, j: number) => V3;
  /** 정점 명도 배율 (밑동 그늘 등). 변위된 위치로 부른다 */
  vertexMul?: (p: V3) => number;
  jitter: number;
  triShade: number;
  /** 법선 변위: 'in' = 안쪽으로만 0..amp, 'both' = ±amp. amp(p0) 는 원래 정점 위치에서의 허용량 (0 이면 변위 없음) */
  bump?: { mode: 'in' | 'both'; amp: (p0: V3) => number };
}

export interface FacetOut { pos: number[]; nor: number[]; col: number[] }

export function emitFacets(f: FacetPatch, out: FacetOut): void {
  const { nu, nv, n } = f;
  const du = f.uLen / nu, dv = f.vLen / nv;
  const pos = (a: number, b: number): V3 => [
    f.origin[0] + f.u[0] * a + f.v[0] * b, f.origin[1] + f.u[1] * a + f.v[1] * b, f.origin[2] + f.u[2] * a + f.v[2] * b,
  ];
  const P: V3[][] = [];
  for (let i = 0; i <= nu; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= nv; j++) {
      const p0 = pos(i * du, j * dv);
      if (i === 0 || j === 0 || i === nu || j === nv) { row.push(p0); continue; }
      const a = i * du + (hash3(i, j, 1, f.seed) - 0.5) * 2 * f.jitter * du;
      const b = j * dv + (hash3(i, j, 2, f.seed) - 0.5) * 2 * f.jitter * dv;
      const p = pos(a, b);
      const amp = f.bump ? f.bump.amp(p0) : 0;
      if (amp > 0) {
        const h = hash3(i, j, 3, f.seed);
        const off = f.bump!.mode === 'in' ? -amp * h : amp * (2 * h - 1);
        p[0] += n[0] * off; p[1] += n[1] * off; p[2] += n[2] * off;
      }
      row.push(p);
    }
    P.push(row);
  }
  const mulOf = f.vertexMul ?? (() => 1);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const c00 = P[i][j], c10 = P[i + 1][j], c11 = P[i + 1][j + 1], c01 = P[i][j + 1];
      const flip = hash3(i, j, 4, f.seed) > 0.5;
      const tris: [V3, V3, V3][] = flip ? [[c00, c10, c01], [c10, c11, c01]] : [[c00, c10, c11], [c00, c11, c01]];
      tris.forEach((tri, t) => {
        let [a, b, c] = tri;
        let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (nx * n[0] + ny * n[1] + nz * n[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
        const len = Math.hypot(nx, ny, nz);
        const nn: V3 = len > 1e-12 ? [nx / len, ny / len, nz / len] : n;
        const base = f.colorAt(2 * i + t, j);
        const shade = 1 + (hash3(i, j, 5 + t, f.seed) - 0.5) * 2 * f.triShade;
        for (const p of [a, b, c]) {
          const k = shade * mulOf(p);
          out.pos.push(p[0], p[1], p[2]);
          out.nor.push(nn[0], nn[1], nn[2]);
          out.col.push(base[0] * k, base[1] * k, base[2] * k);
        }
      });
    }
  }
}
