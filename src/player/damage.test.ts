import { describe, expect, it } from 'vitest';
import { fallDamage } from './damage';

describe('damage', () => {
  describe('fallDamage', () => {
    it('안전 속도 이하면 0', () => {
      expect(fallDamage(5, 10, 5)).toBe(0);
      expect(fallDamage(10, 10, 5)).toBe(0);
    });

    it('초과분×perSpeed (landingSpeed=20, safeSpeed=12, perSpeed=6 → 48)', () => {
      const result = fallDamage(20, 12, 6);
      expect(result).toBe((20 - 12) * 6);
      expect(result).toBe(48);
    });

    it('속도 증가에 따른 피해 선형 증가', () => {
      const base = fallDamage(15, 10, 2);
      const higher = fallDamage(20, 10, 2);
      expect(higher).toBe(base + 10); // 5 더 높음, 2배수 = 10 추가
    });

    it('perSpeed에 정비례', () => {
      const slow = fallDamage(20, 10, 1);
      const fast = fallDamage(20, 10, 5);
      expect(fast).toBe(slow * 5);
    });

    it('음수 속도도 0 (max로 클램프)', () => {
      expect(fallDamage(-5, 10, 5)).toBe(0);
      expect(fallDamage(-100, -50, 10)).toBe(0);
    });
  });
});
