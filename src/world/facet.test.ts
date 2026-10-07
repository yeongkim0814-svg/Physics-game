import { describe, expect, it } from 'vitest';
import { emitFacets, FACET_DEFAULT, splitCount, type FacetOut, type FacetPatch, type V3 } from './facet';

const patch = (over: Partial<FacetPatch> = {}): FacetPatch => ({
  origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], uLen: 10, vLen: 6, nu: 5, nv: 3, n: [0, 0, 1], seed: 3,
  colorAt: () => [0.5, 0.5, 0.5], jitter: 0.3, triShade: 0.08, ...over,
});
const run = (p: FacetPatch): FacetOut => { const o: FacetOut = { pos: [], nor: [], col: [] }; emitFacets(p, o); return o; };
const verts = (o: FacetOut): V3[] => Array.from({ length: o.pos.length / 3 }, (_, i) => [o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2]] as V3);

describe('삼각 분할 패치', () => {
  it('분할 수: 최소 1, 상한, minSplit 이상이면 최소 2 (안쪽 정점 확보)', () => {
    expect(splitCount(10, 8, 40, 3.5)).toBe(2);
    expect(splitCount(3, 8, 40, 3.5)).toBe(1);
    expect(splitCount(100, 2, 40, 3.5)).toBe(40);
    expect(splitCount(10, 8, 40, Infinity)).toBe(2); // tile 로 이미 2
    expect(splitCount(5, 8, 40, Infinity)).toBe(1);
  });
  it('삼각형 수 = 2·nu·nv, 결정적, 시드가 다르면 달라짐', () => {
    const a = run(patch()), b = run(patch()), c = run(patch({ seed: 4 }));
    expect(a.pos.length / 9).toBe(2 * 5 * 3);
    expect(a.pos).toEqual(b.pos);
    expect(a.col).toEqual(b.col);
    expect(a.pos).not.toEqual(c.pos);
  });
  it('가장자리 정점은 격자 위에 고정, 안쪽 정점은 면내 jitter 로 사각형 안에 머문다', () => {
    const vs = verts(run(patch({ bump: { mode: 'both', amp: () => 0.5 } })));
    for (const [x, y] of vs) {
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(10 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(6 + 1e-9);
    }
    // 가장자리(x=0,10 또는 y=0,6)에 놓인 정점은 모두 격자점 (x 는 2 의 배수, y 도 2 의 배수 쪽)
    for (const [x, y, z] of vs) {
      if (x < 1e-9 || Math.abs(x - 10) < 1e-9) { expect(Math.abs(y / 2 - Math.round(y / 2))).toBeLessThan(1e-9); expect(Math.abs(z)).toBeLessThan(1e-9); }
    }
  });
  it("bump 'in': 정점이 바깥(+n) 으로 나오지 않고 amp 이상 패이지 않는다 — 충돌 벽을 침범하지 않는다", () => {
    const vs = verts(run(patch({ bump: { mode: 'in', amp: () => 0.7 } })));
    let dented = 0;
    for (const [, , z] of vs) { expect(z).toBeLessThanOrEqual(1e-9); expect(z).toBeGreaterThanOrEqual(-0.7 - 1e-9); if (z < -0.05) dented++; }
    expect(dented).toBeGreaterThan(0);
  });
  it("bump 'both' 는 ±amp, amp 0 이면 완전히 평평 (걸을 수 있는 면)", () => {
    for (const [, , z] of verts(run(patch({ bump: { mode: 'both', amp: () => 0.4 } })))) expect(Math.abs(z)).toBeLessThanOrEqual(0.4 + 1e-9);
    for (const [, , z] of verts(run(patch({ bump: { mode: 'both', amp: () => 0 } })))) expect(z).toBe(0);
  });
  it('모든 삼각형 법선이 면 바깥(n)을 향하고 단위 길이', () => {
    const o = run(patch({ bump: { mode: 'in', amp: () => 0.6 } }));
    for (let t = 0; t < o.pos.length / 9; t++) {
      const nz = o.nor[t * 9 + 2];
      expect(nz).toBeGreaterThan(0);
      expect(Math.hypot(o.nor[t * 9], o.nor[t * 9 + 1], o.nor[t * 9 + 2])).toBeCloseTo(1, 5);
    }
  });
  it('삼각형마다 색이 다르다 (사각 타일이 아니라 삼각형 단위)', () => {
    const o = run(patch({ colorAt: (i) => [(i % 7) / 7, 0.5, 0.5] }));
    const seen = new Set<string>();
    for (let t = 0; t < o.col.length / 9; t++) seen.add(o.col.slice(t * 9, t * 9 + 3).map((x) => x.toFixed(3)).join());
    expect(seen.size).toBeGreaterThan(10);
  });
  it('기본 외형 수치가 유한하고 양수', () => {
    for (const v of Object.values(FACET_DEFAULT)) expect(v).toBeGreaterThan(0);
  });
});
