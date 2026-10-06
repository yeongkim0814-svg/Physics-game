import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import { buildBlockMesh, estimateTriangles, hash3, sideShade, tileCount, tileColor, type BoxSpec } from './blockTerrain';

const look = VISUAL.lowpoly.presets.dusk.terrain;
const box: BoxSpec = { pos: [0, 5, 0], size: [10, 10, 6], palette: 'rock', tile: 2.5 };

describe('블록 지형 생성기', () => {
  it('타일 개수: 길이/타일 올림, 최소 1, 상한', () => {
    expect(tileCount(10, 2.5, 40)).toBe(4);
    expect(tileCount(10.1, 2.5, 40)).toBe(5);
    expect(tileCount(0.1, 2.5, 40)).toBe(1);
    expect(tileCount(1000, 1, 40)).toBe(40);
  });
  it('삼각형 수 = 예측값, 기본은 아래를 뺀 5면', () => {
    const d = buildBlockMesh([box], look, 40, 1);
    const tris = estimateTriangles([box], 40);
    expect(d.positions.length / 9).toBe(tris);
    // 윗면 4×3 + ±x 3×4 ×2 + ±z 4×4 ×2 타일
    expect(tris).toBe(2 * (4 * 3 + 2 * 3 * 4 + 2 * 4 * 4));
  });
  it('결정적 (같은 입력 = 같은 색), 시드가 다르면 달라짐', () => {
    const a = buildBlockMesh([box], look, 40, 1), b = buildBlockMesh([box], look, 40, 1), c = buildBlockMesh([box], look, 40, 2);
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
    expect(Array.from(a.colors)).not.toEqual(Array.from(c.colors));
  });
  it('법선은 각 삼각형 면 바깥을 향하고 정점은 박스 안(경계 포함)', () => {
    const d = buildBlockMesh([box], look, 40, 1);
    for (let t = 0; t < d.positions.length / 9; t++) {
      const p = (i: number) => [0, 1, 2].map((k) => d.positions[t * 9 + i * 3 + k]);
      const [a, b, c] = [p(0), p(1), p(2)];
      const e1 = b.map((v, k) => v - a[k]), e2 = c.map((v, k) => v - a[k]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dn = [0, 1, 2].map((k) => d.normals[t * 9 + k]);
      expect(n[0] * dn[0] + n[1] * dn[1] + n[2] * dn[2]).toBeGreaterThan(0);
      a.forEach((v, k) => { expect(Math.abs(v - [0, 5, 0][k])).toBeLessThanOrEqual([5, 5, 3][k] + 1e-4); });
    }
  });
  it('faces 로 면을 끈다', () => {
    const only = estimateTriangles([{ ...box, faces: { px: false, nx: false, pz: false, nz: false } }], 40);
    expect(only).toBe(2 * 4 * 3);
  });
  it('타일 색: 팔레트 범위 안에서 흔들리고(명도±), 윗면은 이끼 확률대로 섞인다', () => {
    const noMoss = { ...look, mossTop: 0 }, allMoss = { ...look, mossTop: 1, mossStrength: [1, 1] as [number, number] };
    const base = tileColor(noMoss, 'rock', 7, 2, 3, 4, true), moss = tileColor(allMoss, 'rock', 7, 2, 3, 4, true);
    expect(moss).not.toEqual(base);
    let hi = 0, lo = 9;
    for (let i = 0; i < 200; i++) { const c = tileColor(noMoss, 'rock', 7, 2, i, 0, true); const l = c[0] + c[1] + c[2]; hi = Math.max(hi, l); lo = Math.min(lo, l); }
    expect(hi / lo).toBeGreaterThan(1.2); // 타일마다 확실히 다르다
    let n = 0;
    for (let i = 0; i < 2000; i++) { const c = tileColor({ ...look, mossTop: 0.2 }, 'rock', 9, 2, i, 5, true); const z = tileColor(noMoss, 'rock', 9, 2, i, 5, true); if (c[0] !== z[0]) n++; }
    expect(n / 2000).toBeGreaterThan(0.12);
    expect(n / 2000).toBeLessThan(0.28);
  });
  it('측면 밑동은 어둡고 shadeHeight 위로는 1', () => {
    expect(sideShade(0, look)).toBeCloseTo(look.bottomShade, 5);
    expect(sideShade(look.shadeHeight, look)).toBeCloseTo(1, 5);
    expect(sideShade(1, look)).toBeGreaterThan(look.bottomShade);
  });
  it('해시는 0~1', () => {
    for (let i = 0; i < 100; i++) { const h = hash3(i, i * 3, -i, 5); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
  });
});
