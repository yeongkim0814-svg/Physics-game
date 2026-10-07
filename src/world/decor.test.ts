import { describe, expect, it } from 'vitest';
import { inFootprint, scatter } from './decor';

describe('장식 배치', () => {
  it('결정적이고 고리 범위 안, reject 존중', () => {
    const a = scatter(1, 50, [90, 400]), b = scatter(1, 50, [90, 400]);
    expect(a).toEqual(b);
    expect(a.length).toBe(50);
    for (const p of a) {
      const d = Math.max(Math.abs(p.x), Math.abs(p.z));
      expect(d).toBeGreaterThanOrEqual(90);
      expect(d).toBeLessThanOrEqual(400);
    }
    const c = scatter(2, 40, [0, 50], (x) => x > 0);
    expect(c.every((p) => p.x <= 0)).toBe(true);
  });
  it('시도 상한: 전부 막히면 빈 배열', () => {
    expect(scatter(3, 10, [0, 10], () => true)).toEqual([]);
  });
  it('inFootprint 여유', () => {
    expect(inFootprint(6, 0, [0, 0], [10, 10], 0)).toBe(false);
    expect(inFootprint(6, 0, [0, 0], [10, 10], 1.5)).toBe(true);
  });
});
