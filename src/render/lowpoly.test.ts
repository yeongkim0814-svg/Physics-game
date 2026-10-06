import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import { desaturateHex, regionDesatAmount } from './desat';
import { mixHex, skyColorAt } from './skyMath';
import { hash2, tintColor, valueNoise } from './tint';
import { COL } from './palette';

const lum = (h: number) => 0.299 * ((h >> 16) & 255) + 0.587 * ((h >> 8) & 255) + 0.114 * (h & 255);
const spread = (h: number) => Math.max((h >> 16) & 255, (h >> 8) & 255, h & 255) - Math.min((h >> 16) & 255, (h >> 8) & 255, h & 255);

describe('탈색', () => {
  it('0 이면 원색, 1 이면 회색(휘도 유지), 중간은 채도 감소', () => {
    expect(desaturateHex(0xe0a85a, 0)).toBe(0xe0a85a);
    const g = desaturateHex(0xe0a85a, 1);
    expect(spread(g)).toBeLessThanOrEqual(1);
    expect(Math.abs(lum(g) - lum(0xe0a85a))).toBeLessThan(1.5);
    expect(spread(desaturateHex(0xe0a85a, 0.5))).toBeLessThan(spread(0xe0a85a));
  });
  it('지역 탈색: 중심은 강도, 반경 밖은 0, 겹치면 최대값, 최대 4개', () => {
    const r = [[0, 0, 10, 0.8], [5, 0, 10, 0.5]] as const;
    expect(regionDesatAmount(0, 0, r, 0.5)).toBeCloseTo(0.8, 5);
    expect(regionDesatAmount(30, 0, r, 0.5)).toBe(0);
    expect(regionDesatAmount(7, 0, [[0, 0, 10, 1]], 0.5)).toBeLessThan(1); // 가장자리 부드럽게
    expect(regionDesatAmount(7, 0, [[0, 0, 10, 1]], 0.5)).toBeGreaterThan(0);
    const five = Array.from({ length: 5 }, (_, i) => [i * 100, 0, 10, 1] as const);
    expect(regionDesatAmount(400, 0, five, 0.5)).toBe(0); // 5번째는 무시
  });
});

describe('낮 하늘 그라디언트', () => {
  const S = VISUAL.lowpoly.sky;
  it('지평선=안개색, 천정=zenith, 고도가 오를수록 청색 쪽(R 감소)', () => {
    expect(skyColorAt(0, S)).toBe(VISUAL.lowpoly.fog.color);
    expect(skyColorAt(-0.5, S)).toBe(S.horizon);
    expect(skyColorAt(1, S)).toBe(S.zenith);
    expect((skyColorAt(0.8, S) >> 16) & 255).toBeLessThan((skyColorAt(0.1, S) >> 16) & 255);
  });
  it('mixHex 끝점', () => {
    expect(mixHex(0x000000, 0xffffff, 0)).toBe(0);
    expect(mixHex(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });
});

describe('정점색 노이즈', () => {
  it('결정적이고 0~1 범위, 정수 격자점에서 해시와 일치', () => {
    expect(hash2(3, 4, 9)).toBe(hash2(3, 4, 9));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 0.37, i * 0.91, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(valueNoise(2, 3, 7)).toBeCloseTo(hash2(2, 3, 7), 10);
  });
  it('밑동은 먼지색 쪽으로 어두워지고 높은 곳은 노이즈만 (±noiseAmp)', () => {
    const T = VISUAL.lowpoly.tint;
    const high = tintColor(10, 50, 10, T), low = tintColor(10, 0, 10, T);
    for (const c of high) expect(Math.abs(c - 1)).toBeLessThanOrEqual(T.noiseAmp + 1e-9);
    expect(low[2]).toBeLessThan(high[2]); // 파랑 성분이 가장 많이 줄어 따뜻해진다
  });
});

describe('로우폴리 팔레트', () => {
  it('기능색은 PS1 팔레트와 동일 (게임 규칙 직결)', () => {
    expect(COL.cyan).toBe(0x6fc4c0);
    expect(COL.amber).toBe(0xd89a2e);
    expect(COL.green).toBe(0x7fbf6a);
    expect(COL.red).toBe(0xc0452e);
  });
});
