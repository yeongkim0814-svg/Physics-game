import { describe, expect, it } from 'vitest';
import {
  recoilImpulse,
  recoilDeltaV,
  projectileEnergy,
  currentSpread,
  heatAfterShot,
  decayHeat,
  rearWear,
  segmentSphereToi,
} from './launcherMath';

describe('launcherMath', () => {
  describe('recoilImpulse', () => {
    it('기본 공식 J = m·v·recoil·scale', () => {
      // m=2, v=40, recoil=1, scale=7.5 → 600
      expect(recoilImpulse(2, 40, 1, 7.5)).toBe(600);
    });

    it('recoil 계수는 정확히 배수로 작용 (0.6배)', () => {
      expect(recoilImpulse(2, 40, 0.6, 7.5)).toBe(600 * 0.6);
    });

    it('질량에 비례', () => {
      const base = recoilImpulse(1, 40, 1, 7.5);
      expect(recoilImpulse(2, 40, 1, 7.5)).toBe(base * 2);
      expect(recoilImpulse(4, 40, 1, 7.5)).toBe(base * 4);
    });

    it('속도에 비례', () => {
      const base = recoilImpulse(2, 10, 1, 7.5);
      expect(recoilImpulse(2, 20, 1, 7.5)).toBe(base * 2);
    });

    it('scale에 비례', () => {
      const base = recoilImpulse(2, 40, 1, 1);
      expect(recoilImpulse(2, 40, 1, 7.5)).toBe(base * 7.5);
    });
  });

  describe('recoilDeltaV', () => {
    it('임펄스를 질량으로 나눔 Δv = J / M', () => {
      // impulse 600, mass 70 → 600/70
      expect(recoilDeltaV(600, 70)).toBeCloseTo(600 / 70);
    });

    it('질량이 크면 속도 변화 작음 (역비례)', () => {
      const small = recoilDeltaV(100, 50);
      const large = recoilDeltaV(100, 100);
      expect(large).toBe(small / 2);
    });

    it('임펄스가 크면 속도 변화 큼 (정비례)', () => {
      const small = recoilDeltaV(100, 50);
      const large = recoilDeltaV(200, 50);
      expect(large).toBe(small * 2);
    });
  });

  describe('projectileEnergy', () => {
    it('운동 에너지 공식 E = ½mv²', () => {
      // m=2, v=40 → 1600
      expect(projectileEnergy(2, 40)).toBe(1600);
    });

    it('속도 2배 → 에너지 4배 (속도 제곱)', () => {
      const base = projectileEnergy(2, 10);
      expect(projectileEnergy(2, 20)).toBe(base * 4);
    });

    it('질량 2배 → 에너지 2배 (질량 선형)', () => {
      const base = projectileEnergy(1, 40);
      expect(projectileEnergy(2, 40)).toBe(base * 2);
    });

    it('영속도일 때 에너지 0', () => {
      expect(projectileEnergy(5, 0)).toBe(0);
    });
  });

  describe('currentSpread', () => {
    it('안정성 0 → base + heat (열 증가로 퍼짐)', () => {
      // stability=0 → (base + heat) / (1 + 0) = base + heat
      expect(currentSpread(0.05, 0.1, 0, 1.0)).toBeCloseTo(0.15);
    });

    it('안정성 1 → 절반으로 감소 (base + heat) / 2', () => {
      const withoutStability = currentSpread(0.05, 0.1, 0, 1.0); // 0.15
      const withStability = currentSpread(0.05, 0.1, 1, 1.0); // 0.15 / 2
      expect(withStability).toBeCloseTo(withoutStability / 2);
    });

    it('max로 클램프', () => {
      const maxVal = 0.5;
      expect(currentSpread(0.5, 1.0, 0, maxVal)).toBe(maxVal);
      expect(currentSpread(1.0, 1.0, 0, maxVal)).toBe(maxVal);
    });

    it('음수 안정성은 0으로 취급', () => {
      // stability -1 → Math.max(0, -1) = 0
      expect(currentSpread(0.05, 0.1, -1, 1.0)).toBeCloseTo(0.15);
      expect(currentSpread(0.05, 0.1, -999, 1.0)).toBeCloseTo(0.15);
    });

    it('열로 인한 퍼짐 증가', () => {
      const noHeat = currentSpread(0.1, 0, 0, 1.0);
      const withHeat = currentSpread(0.1, 0.2, 0, 1.0);
      expect(withHeat).toBeCloseTo(noHeat + 0.2);
    });
  });

  describe('heatAfterShot', () => {
    it('발사 후 열 증가', () => {
      expect(heatAfterShot(0.5, 0.1, 1.0)).toBeCloseTo(0.6);
    });

    it('max에서 포화 (초과 금지)', () => {
      const max = 1.0;
      expect(heatAfterShot(0.8, 0.5, max)).toBe(max);
      expect(heatAfterShot(0.99, 0.1, max)).toBe(max);
    });

    it('초기 열이 max이면 유지', () => {
      expect(heatAfterShot(1.0, 0.5, 1.0)).toBe(1.0);
    });

    it('0에서 시작', () => {
      expect(heatAfterShot(0, 0.2, 1.0)).toBeCloseTo(0.2);
    });
  });

  describe('decayHeat', () => {
    it('시간 경과에 따라 선형 감소', () => {
      // dt=1초, recoverPerSec=0.1 → 0.1 감소
      expect(decayHeat(0.5, 0.1, 1.0)).toBeCloseTo(0.4);
    });

    it('dt가 클수록 더 감소', () => {
      const dt1 = decayHeat(0.5, 0.1, 1.0);
      const dt2 = decayHeat(0.5, 0.1, 2.0);
      expect(dt2).toBeCloseTo(dt1 - 0.1);
    });

    it('0 미만으로 내려가지 않음 (클램프)', () => {
      expect(decayHeat(0.1, 0.5, 1.0)).toBe(0);
      expect(decayHeat(0.05, 0.1, 1.0)).toBe(0);
    });

    it('초기 열이 0이면 유지', () => {
      expect(decayHeat(0, 0.5, 5.0)).toBe(0);
    });

    it('dt=0이면 열 유지', () => {
      expect(decayHeat(0.7, 0.1, 0)).toBe(0.7);
    });

    it('음수 recoverPerSec (비정상 입력)', () => {
      // 음수 recoverPerSec는 열이 증가 (테스트만, 정상 동작)
      expect(decayHeat(0.5, -0.1, 1.0)).toBeCloseTo(0.6);
    });
  });

  describe('rearWear', () => {
    it('후방 슬롯 마모 계산', () => {
      // wear = impulse × wearPerRecoil × wearRate
      expect(rearWear(100, 0.01, 1.0)).toBe(1.0);
    });

    it('임펄스 2배 → 마모 2배 (선형)', () => {
      const small = rearWear(100, 0.01, 1.0);
      const large = rearWear(200, 0.01, 1.0);
      expect(large).toBe(small * 2);
    });

    it('wearRate 0 → 마모 없음', () => {
      expect(rearWear(1000, 0.01, 0)).toBe(0);
    });

    it('wearRate 높을수록 빨리 마모', () => {
      const slow = rearWear(100, 0.01, 0.5);
      const fast = rearWear(100, 0.01, 1.0);
      expect(fast).toBe(slow * 2);
    });

    it('wearPerRecoil에 비례', () => {
      const small = rearWear(100, 0.01, 1.0);
      const large = rearWear(100, 0.02, 1.0);
      expect(large).toBe(small * 2);
    });
  });

  describe('segmentSphereToi', () => {
    it('정면 관통: 구 중심 (0,0,10), r=1, 원점에서 +z 방향, len=20 → toi=9', () => {
      // origin=[0,0,0], dir=[0,0,1], center=[0,0,10], radius=1
      // 거리: 10-1=9
      const result = segmentSphereToi([0, 0, 0], [0, 0, 1], 20, [0, 0, 10], 1);
      expect(result).toBeCloseTo(9);
    });

    it('선분이 너무 짧아서 못 닿음 → null', () => {
      // origin=[0,0,0], dir=[0,0,1], center=[0,0,10], radius=1, len=5
      // 선분은 [0,0,0]~[0,0,5], 구는 [0,0,9]~[0,0,11]
      const result = segmentSphereToi([0, 0, 0], [0, 0, 1], 5, [0, 0, 10], 1);
      expect(result).toBeNull();
    });

    it('옆으로 빗나감 → null', () => {
      // 선분이 y축을 따라 이동, 구는 z축 위치
      const result = segmentSphereToi([0, 0, 0], [0, 1, 0], 20, [0, 0, 10], 1);
      expect(result).toBeNull();
    });

    it('시작점이 구 내부면 0 반환', () => {
      // origin=[0,0,10] (구 중심), 구 내부
      const result = segmentSphereToi([0, 0, 10], [0, 0, 1], 20, [0, 0, 10], 5);
      expect(result).toBe(0);
    });

    it('뒤쪽(-z)으로 쏘면 null', () => {
      // origin=[0,0,0], dir=[0,0,-1] (음의 z), center=[0,0,10]
      const result = segmentSphereToi([0, 0, 0], [0, 0, -1], 20, [0, 0, 10], 1);
      expect(result).toBeNull();
    });

    it('경계 케이스: len 정확히 맞음', () => {
      // origin=[0,0,0], dir=[0,0,1], center=[0,0,10], r=1
      // first intersection at t=9, len=9 (정확히 도달)
      const result = segmentSphereToi([0, 0, 0], [0, 0, 1], 9, [0, 0, 10], 1);
      expect(result).toBeCloseTo(9);
    });

    it('len 조금 짧아서 못 닿음', () => {
      // toi=9.0001이지만 len=8.9999
      const result = segmentSphereToi([0, 0, 0], [0, 0, 1], 8.9999, [0, 0, 10], 1);
      expect(result).toBeNull();
    });

    it('구 중심이 음수 좌표에도 동작', () => {
      // origin=[0,0,0], dir=[0,0,1], center=[0,0,-10], r=1
      // 거리: 10-1=9 (음수 방향이지만 거리는 양수)
      const result = segmentSphereToi([0, 0, 0], [0, 0, 1], 20, [0, 0, -10], 1);
      expect(result).toBeNull();
    });

    it('1차원이 아닌 3D 방향도 동작', () => {
      // origin=[0,0,0], dir=[1,0,0] (x축), center=[10,0,0]
      const result = segmentSphereToi([0, 0, 0], [1, 0, 0], 20, [10, 0, 0], 1);
      expect(result).toBeCloseTo(9);
    });

    it('대각선 방향도 동작', () => {
      // origin=[0,0,0], dir=[1/√2, 1/√2, 0], center=[10,10,0]
      // 거리 계산으로 교점 찾음
      const dir: [number, number, number] = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
      const result = segmentSphereToi([0, 0, 0], dir, 20, [10, 10, 0], 1);
      expect(result).not.toBeNull();
      if (result !== null) {
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(20);
      }
    });

    it('운동량 보존 해석: scale=1 일 때 발사체 운동량 = 반동 임펄스', () => {
      // recoilImpulse의 scale=1 경우
      // 발사체 운동량 p = m·v
      const mass = 2;
      const speed = 40;
      const impulse = recoilImpulse(mass, speed, 1, 1);
      const projectileMomentum = mass * speed;
      expect(impulse).toBe(projectileMomentum);
    });
  });
});
