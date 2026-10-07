// 고원 바깥 연속 삼각 격자 (시각 전용, 충돌 없음). 계단형 칸(평평한 윗면 + 수직 벽)은 아무리 변위·기울여도 판자처럼 보이므로,
// 바깥 지형은 양자화 전의 연속 높이 함수(계곡·메사·암주·산맥·층 선반 + 바깥 변위)를 직접 표본한 삼각 격자로 만든다. 경사가 곧 절벽이다.
// 두 겹: 가까운 곳 fineCell(m) 간격, 멀리 coarseCell(m) 간격. 겹 경계의 가는 정점은 거친 격자의 변 위 값으로 맞춰 균열(T-접합)을 없앤다.
// 고원 쪽 이음새(seam)는 계단형 사각 지형과 만나므로 blend 구간에서 양자화 높이 → 연속 높이로 서서히 넘어가고, 남는 틈은 가림막이 덮는다.
// 순수 계산 (THREE/Rapier 의존 없음).
import { hash3 } from '../facet';
import { lerp, smoothstep } from './noise';
import type { TerrainField } from './terrainField';

export interface OuterParams {
  /** 이음새 반폭(m): 안쪽은 계단형 사각 지형, 바깥은 이 격자. fineCell 의 배수 */
  seam: number;
  fineCell: number; fineHalf: number;
  coarseCell: number; coarseHalf: number;
  /** 이 반경(m) 밖 거친 칸은 만들지 않는다 (카메라 far 너머) */
  radius: number;
  /** 이음새에서 이만큼(m) 바깥까지 양자화 높이 → 연속 높이로 섞는다 */
  blend: number;
}

export type V3 = [number, number, number];
interface Ring { cell: number; half: number; n: number; h: Float32Array }

export class OuterLattice {
  readonly fine: Ring;
  readonly coarse: Ring;

  constructor(private field: TerrainField, readonly P: OuterParams) {
    this.coarse = this.makeRing(P.coarseCell, P.coarseHalf);
    this.fine = this.makeRing(P.fineCell, P.fineHalf);
    this.stitch();
  }

  /** 격자 정점 하나의 높이: 이음새에서는 계단형 높이, 바깥으로 갈수록 연속 높이 (+ 바깥 변위) */
  private vertexHeight(x: number, z: number): number {
    const F = this.field, P = this.P, m = Math.max(Math.abs(x), Math.abs(z));
    const w = smoothstep(P.seam, P.seam + P.blend, m);
    const q = F.surface(x, z);
    const c = F.carveCanyon(x, z, F.continuous(x, z));
    return lerp(Number.isFinite(q) ? q : c, c, w) + F.outsideShift(x, z);
  }

  private makeRing(cell: number, half: number): Ring {
    const n = Math.round((2 * half) / cell), h = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) h[j * (n + 1) + i] = this.vertexHeight(-half + i * cell, -half + j * cell);
    return { cell, half, n, h };
  }

  /** 가는 격자 바깥 경계의 정점 중 거친 격자에 없는 것은 거친 격자 변 위의 선형 보간 값으로 */
  private stitch() {
    const f = this.fine, c = this.coarse, ratio = c.cell / f.cell;
    const cAt = (x: number, z: number) => c.h[Math.round((z + c.half) / c.cell) * (c.n + 1) + Math.round((x + c.half) / c.cell)];
    for (let k = 0; k <= f.n; k++) {
      if (k % ratio === 0) continue;
      const t = -f.half + k * f.cell, t0 = Math.floor(t / c.cell) * c.cell, t1 = t0 + c.cell, u = (t - t0) / c.cell;
      for (const e of [-f.half, f.half]) {
        f.h[k * (f.n + 1) + (e === -f.half ? 0 : f.n)] = lerp(cAt(e, t0), cAt(e, t1), u); // x = ±half, z = t
        f.h[(e === -f.half ? 0 : f.n) * (f.n + 1) + k] = lerp(cAt(t0, e), cAt(t1, e), u); // z = ±half, x = t
      }
    }
  }

  private static diag(ix: number, iz: number, ring: number): boolean { return hash3(ix, iz, ring, 77) > 0.5; }

  /** 점 (x,z) 위의 격자 표면 높이 (렌더되는 삼각형과 같은 보간). 이음새 안쪽이거나 범위 밖이면 null */
  heightAt(x: number, z: number): number | null {
    const P = this.P, m = Math.max(Math.abs(x), Math.abs(z));
    if (m < P.seam) return null;
    const ring = m < P.fineHalf ? this.fine : this.coarse;
    if (ring === this.coarse && (m >= P.coarseHalf || Math.hypot(x, z) > P.radius + ring.cell)) return null;
    const fx = (x + ring.half) / ring.cell, fz = (z + ring.half) / ring.cell;
    const ix = Math.min(ring.n - 1, Math.floor(fx)), iz = Math.min(ring.n - 1, Math.floor(fz)), u = fx - ix, v = fz - iz;
    const H = (a: number, b: number) => ring.h[(iz + b) * (ring.n + 1) + ix + a];
    // 대각선: true = (0,0)-(1,1) 쪽 / false = (1,0)-(0,1) 쪽 (forEachTriangle 과 같은 규칙)
    if (OuterLattice.diag(ix, iz, ring === this.fine ? 0 : 1)) {
      return u >= v ? H(0, 0) + (H(1, 0) - H(0, 0)) * u + (H(1, 1) - H(1, 0)) * v : H(0, 0) + (H(1, 1) - H(0, 1)) * u + (H(0, 1) - H(0, 0)) * v;
    }
    return u + v <= 1 ? H(0, 0) + (H(1, 0) - H(0, 0)) * u + (H(0, 1) - H(0, 0)) * v : H(1, 1) + (H(0, 1) - H(1, 1)) * (1 - u) + (H(1, 0) - H(1, 1)) * (1 - v);
  }

  /** 모든 격자 삼각형 (위쪽 법선 감김은 호출자가 정렬). ix/iz = 칸 번호, ring 0 = 가는 격자 / 1 = 거친 격자 */
  forEachTriangle(cb: (a: V3, b: V3, c: V3, ix: number, iz: number, ring: 0 | 1) => void) {
    const P = this.P;
    for (const r of [this.fine, this.coarse] as const) {
      const rid = r === this.fine ? 0 : 1;
      for (let iz = 0; iz < r.n; iz++) {
        for (let ix = 0; ix < r.n; ix++) {
          const cx = -r.half + (ix + 0.5) * r.cell, cz = -r.half + (iz + 0.5) * r.cell, m = Math.max(Math.abs(cx), Math.abs(cz));
          if (rid === 0 ? m < P.seam : m < P.fineHalf || Math.hypot(cx, cz) > P.radius) continue;
          const x0 = -r.half + ix * r.cell, z0 = -r.half + iz * r.cell, x1 = x0 + r.cell, z1 = z0 + r.cell;
          const H = (a: number, b: number) => r.h[(iz + b) * (r.n + 1) + ix + a];
          const A: V3 = [x0, H(0, 0), z0], B: V3 = [x1, H(1, 0), z0], C: V3 = [x1, H(1, 1), z1], D: V3 = [x0, H(0, 1), z1];
          if (OuterLattice.diag(ix, iz, rid)) { cb(A, B, C, ix, iz, rid); cb(A, C, D, ix, iz, rid); } else { cb(A, B, D, ix, iz, rid); cb(B, C, D, ix, iz, rid); }
        }
      }
    }
  }

  /** 이음새 가림막용 윗변 점들: 4면, fineCell 간격. 각 구간 [p0, p1] (y = 격자 높이) 과 안쪽을 향하는 법선(nx, nz) */
  forEachSeamSegment(cb: (p0: V3, p1: V3, nx: number, nz: number) => void) {
    const f = this.fine, S = this.P.seam, k = Math.round((S + f.half) / f.cell), lo = Math.round((-S + f.half) / f.cell);
    const at = (i: number, j: number): V3 => [-f.half + i * f.cell, f.h[j * (f.n + 1) + i], -f.half + j * f.cell];
    for (let t = lo; t < k; t++) {
      cb(at(k, t), at(k, t + 1), -1, 0);   // x = +S (안쪽 = -x)
      cb(at(lo, t), at(lo, t + 1), 1, 0);  // x = -S
      cb(at(t, k), at(t + 1, k), 0, -1);   // z = +S
      cb(at(t, lo), at(t + 1, lo), 0, 1);  // z = -S
    }
  }
}
