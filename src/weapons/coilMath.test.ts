import { describe, expect, it } from 'vitest';
import {
  chargeStep,
  arcDamage,
  overchargeFraction,
  overchargeWear,
  jaggedPath,
  nearestWithin,
} from './coilMath';

describe('coilMath', () => {
  describe('chargeStep', () => {
    it('dt/chargeTime 만큼 증가', () => {
      // charge=0, dt=0.5, chargeTime=1.5 → 0.5/1.5 ≈ 0.333
      expect(chargeStep(0, 0.5, 1.5, 1.0)).toBeCloseTo(1 / 3);
    });

    it('max에서 포화 (초과 불가)', () => {
      const max = 1.0;
      expect(chargeStep(0.9, 0.2, 1.0, max)).toBe(max);
      expect(chargeStep(0.95, 0.1, 1.0, max)).toBe(max);
    });

    it('누적 호출로 chargeTime=1.5에서 1.5초 후 1.0 도달', () => {
      const chargeTime = 1.5;
      const max = 1.0;
      let charge = 0;

      // 0.3초마다 5번 호출 → 1.5초
      for (let i = 0; i < 5; i++) {
        charge = chargeStep(charge, 0.3, chargeTime, max);
      }

      expect(charge).toBeCloseTo(1.0);
    });

    it('0에서 시작하는 기본 케이스', () => {
      expect(chargeStep(0, 0.25, 1.0, 1.0)).toBeCloseTo(0.25);
    });

    it('이미 max라면 유지', () => {
      expect(chargeStep(1.0, 0.5, 1.0, 1.0)).toBe(1.0);
    });
  });

  describe('arcDamage', () => {
    it('maxDamage × charge 비례', () => {
      expect(arcDamage(100, 1.0)).toBe(100);
      expect(arcDamage(100, 0.5)).toBe(50);
    });

    it('charge 1.5면 1.5배 (과충전)', () => {
      const base = arcDamage(100, 1.0);
      expect(arcDamage(100, 1.5)).toBe(base * 1.5);
    });

    it('charge 0 → 피해 0', () => {
      expect(arcDamage(100, 0)).toBe(0);
    });

    it('높은 maxDamage와 charge 조합', () => {
      expect(arcDamage(250, 2.0)).toBe(500);
    });
  });

  describe('overchargeFraction', () => {
    it('charge ≤ at 이면 0', () => {
      expect(overchargeFraction(0.5, 1.0, 1.5)).toBe(0);
      expect(overchargeFraction(1.0, 1.0, 1.5)).toBe(0);
    });

    it('charge = max 이면 1', () => {
      expect(overchargeFraction(1.5, 1.0, 1.5)).toBe(1.0);
    });

    it('중간값 선형 (at=1, max=1.5, charge=1.25 → 0.5)', () => {
      expect(overchargeFraction(1.25, 1.0, 1.5)).toBeCloseTo(0.5);
    });

    it('max ≤ at 이면 항상 0', () => {
      expect(overchargeFraction(1.0, 1.0, 1.0)).toBe(0);
      expect(overchargeFraction(2.0, 1.5, 1.0)).toBe(0);
    });

    it('범위 밖은 0..1로 클램프', () => {
      // charge > max인 경우 1로 클램프
      expect(overchargeFraction(2.0, 1.0, 1.5)).toBe(1.0);
      // charge < at인 경우 0으로 클램프
      expect(overchargeFraction(0.5, 1.0, 1.5)).toBe(0);
    });
  });

  describe('overchargeWear', () => {
    it('fraction 0 이면 0', () => {
      expect(overchargeWear(0, 0.1, 1.0)).toBe(0);
    });

    it('fraction 1이면 wearOvercharge × wearRate', () => {
      expect(overchargeWear(1.0, 0.1, 2.0)).toBe(0.2);
    });

    it('중간값에서 선형 비례', () => {
      // fraction=0.5, wearOvercharge=0.1, wearRate=2.0 → 0.1
      expect(overchargeWear(0.5, 0.1, 2.0)).toBe(0.1);
    });

    it('wearRate 0 → 마모 없음', () => {
      expect(overchargeWear(1.0, 0.1, 0)).toBe(0);
    });

    it('높은 마모값', () => {
      expect(overchargeWear(0.8, 0.5, 3.0)).toBeCloseTo(1.2);
    });
  });

  describe('jaggedPath', () => {
    it('점 개수 = segments + 1', () => {
      const path = jaggedPath([0, 0, 0], [10, 0, 0], 5, 1.0, () => 0);
      expect(path.length).toBe(6);
    });

    it('첫/마지막 점이 정확히 a/b', () => {
      const a: [number, number, number] = [1, 2, 3];
      const b: [number, number, number] = [4, 5, 6];
      const path = jaggedPath(a, b, 5, 1.0, () => 0);
      expect(path[0]).toEqual(a);
      expect(path[path.length - 1]).toEqual(b);
    });

    it('rng()=>0.5 (offset 0)일 때 직선 위의 등간격 점', () => {
      // a=(0,0,0), b=(10,0,0), segments=4, rng()=>0.5
      // offset: (0.5*2-1)*amp = 0 (평형점)
      // → 모든 중간점이 x축 위에 있음
      const path = jaggedPath([0, 0, 0], [10, 0, 0], 4, 1.0, () => 0.5);
      // 점들이 선 위에 있는지 확인 (y, z = 0)
      for (let i = 1; i < path.length - 1; i++) {
        expect(path[i][1]).toBeCloseTo(0, 5);
        expect(path[i][2]).toBeCloseTo(0, 5);
      }
    });

    it('모든 점이 직선에서 amp·√2 이내 (수직 거리)', () => {
      const a: [number, number, number] = [0, 0, 0];
      const b: [number, number, number] = [10, 0, 0];
      const amp = 2.0;
      const path = jaggedPath(a, b, 10, amp, () => Math.random());

      // 직선은 x축 (y=0, z=0)
      for (let i = 1; i < path.length - 1; i++) {
        const perpendicularDist = Math.hypot(path[i][1], path[i][2]);
        // sin 포락선의 최대 * √2 이하
        expect(perpendicularDist).toBeLessThanOrEqual(amp * Math.sqrt(2) + 1e-6);
      }
    });

    it('a==b인 퇴화 케이스에서 NaN 없음', () => {
      const path = jaggedPath([5, 5, 5], [5, 5, 5], 4, 1.0, () => 0.5);
      for (const pt of path) {
        expect(Number.isNaN(pt[0])).toBe(false);
        expect(Number.isNaN(pt[1])).toBe(false);
        expect(Number.isNaN(pt[2])).toBe(false);
      }
    });

    it('직선이 y축과 평행 (수직 방향)일 때 NaN 없음', () => {
      // a=(5, 0, 5), b=(5, 10, 5) → y축 평행
      const path = jaggedPath([5, 0, 5], [5, 10, 5], 4, 1.0, () => 0.5);
      for (const pt of path) {
        expect(Number.isNaN(pt[0])).toBe(false);
        expect(Number.isNaN(pt[1])).toBe(false);
        expect(Number.isNaN(pt[2])).toBe(false);
      }
    });
  });

  describe('nearestWithin', () => {
    it('범위 내 가장 가까운 항목 반환', () => {
      const items = [
        { position: { x: 3, y: 0, z: 0 }, id: 'a' },
        { position: { x: 10, y: 0, z: 0 }, id: 'b' },
      ];
      const result = nearestWithin({ x: 0, y: 0, z: 0 }, items, 20);
      expect(result?.id).toBe('a');
    });

    it('범위 밖이면 null', () => {
      const items = [{ position: { x: 10, y: 0, z: 0 }, id: 'a' }];
      const result = nearestWithin({ x: 0, y: 0, z: 0 }, items, 5);
      expect(result).toBeNull();
    });

    it('경계 (정확히 maxDist)는 포함', () => {
      const items = [{ position: { x: 5, y: 0, z: 0 }, id: 'a' }];
      const result = nearestWithin({ x: 0, y: 0, z: 0 }, items, 5);
      expect(result?.id).toBe('a');
    });

    it('filter로 후보 제외', () => {
      const items = [
        { position: { x: 3, y: 0, z: 0 }, id: 'a' },
        { position: { x: 5, y: 0, z: 0 }, id: 'b' },
      ];
      const result = nearestWithin(
        { x: 0, y: 0, z: 0 },
        items,
        20,
        (t) => t.id === 'b'
      );
      expect(result?.id).toBe('b');
    });

    it('빈 배열은 null', () => {
      const result = nearestWithin({ x: 0, y: 0, z: 0 }, [], 100);
      expect(result).toBeNull();
    });

    it('3D 거리 계산 정확도', () => {
      const items = [
        { position: { x: 3, y: 4, z: 0 }, id: 'a' }, // 거리 5
        { position: { x: 0, y: 0, z: 5 }, id: 'b' }, // 거리 5
      ];
      const result = nearestWithin({ x: 0, y: 0, z: 0 }, items, 20);
      // 둘 다 거리 5이므로 마지막 만난 'b' 반환 (d <= bestD 조건)
      expect(result?.id).toBe('b');
    });
  });
});
