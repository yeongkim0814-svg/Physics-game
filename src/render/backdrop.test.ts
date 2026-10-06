import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import { MAP } from '../data/map';
import { debrisPlacement } from '../world/debris';
import { azimuthOf, azimuthToPixelX, centerOffsetY, cylinderHeight, rowAtElevation } from './backdropMath';
import { skyColorAt, skyColorWithGlow } from './skyMath';

const B = VISUAL.lowpoly.backdrop;

describe('백드롭 파라미터', () => {
  it('정사각 픽셀이면 원통 높이 = 둘레/4 (2048×512)', () => {
    expect(cylinderHeight(B)).toBeCloseTo(2 * Math.PI * B.radius / 4 * B.heightScale, 5);
  });
  it('horizonV 가 클수록 원통 중심이 눈높이보다 위, 지평선 행은 horizonV·height', () => {
    expect(centerOffsetY({ ...B, horizonV: 0.5 })).toBeCloseTo(0, 6);
    expect(centerOffsetY({ ...B, horizonV: 0.7 })).toBeGreaterThan(0);
    expect(rowAtElevation(B, 0)).toBeCloseTo(B.horizonV * B.height, 6);
    expect(rowAtElevation(B, 0.3)).toBeLessThan(rowAtElevation(B, 0));
  });
  it('방위 → 이미지 x: 북(-z)=θ π, 동(+x)=θ π/2 는 왼쪽으로 갈수록 커진다, 한 바퀴 래핑', () => {
    expect(azimuthToPixelX(0, 2048)).toBe(0);
    expect(azimuthToPixelX(Math.PI, 2048)).toBeCloseTo(1024, 6);
    expect(azimuthToPixelX(Math.PI / 2, 2048)).toBeCloseTo(1536, 6);
    expect(azimuthToPixelX(2 * Math.PI + 1, 2048)).toBeCloseTo(azimuthToPixelX(1, 2048), 6);
    expect(azimuthToPixelX(-1, 2048)).toBeCloseTo(azimuthToPixelX(2 * Math.PI - 1, 2048), 6);
    expect(azimuthOf(0, -1)).toBeCloseTo(Math.PI, 6);
  });
  it('관측소(목적지) 방위가 백드롭 빛기둥 방위와 일치 (±2도)', () => {
    const o = MAP.destinations.find((d) => d.id === 'observatory')!;
    const deg = ((azimuthOf(o.pos[0], o.pos[2]) * 180) / Math.PI + 360) % 360;
    expect(Math.abs(deg - B.beaconAzimuthDeg)).toBeLessThan(2);
  });
  it('해 원반 방위가 sunAzimuthDeg 와 일치 (±2도)', () => {
    const d = VISUAL.lowpoly.presets.dusk.sky.sun.dir!;
    const deg = ((azimuthOf(d[0], d[2]) * 180) / Math.PI + 360) % 360;
    expect(Math.abs(deg - B.sunAzimuthDeg)).toBeLessThan(2);
  });
});

describe('황혼 하늘', () => {
  const S = VISUAL.lowpoly.presets.dusk.sky;
  it('4단 그라디언트: 끝점·중간 단 색이 설정과 같다', () => {
    expect(skyColorAt(0, S)).toBe(S.horizon);
    expect(skyColorAt(1, S)).toBe(S.zenith);
    expect(skyColorAt(Math.pow(1 / 3, 1 / S.gradientPower), S)).toBe(S.low);
    expect(skyColorAt(Math.pow(2 / 3, 1 / S.gradientPower), S)).toBe(S.mid);
  });
  it('태양 번짐: 해 방향에서 가장 강하고 반대편은 원색', () => {
    const base = 0x8a6bb5;
    expect(skyColorWithGlow(base, -1, S.glow)).toBe(base);
    const at = skyColorWithGlow(base, 1, S.glow);
    expect((at >> 16) & 255).toBeGreaterThan((base >> 16) & 255);
  });
});

describe('떠 있는 파편 배치', () => {
  const D = VISUAL.lowpoly.debris;
  it('결정적, 고리·높이 범위, 개수', () => {
    const a = debrisPlacement(D, 6), b = debrisPlacement(D, 6);
    expect(a).toEqual(b);
    expect(a.length).toBe(D.count);
    for (const it of a) {
      const r = Math.hypot(it.x, it.z);
      expect(r).toBeGreaterThanOrEqual(D.ring[0] - 1e-6); expect(r).toBeLessThanOrEqual(D.ring[1] + 1e-6);
      expect(it.y).toBeGreaterThanOrEqual(D.elev[0]); expect(it.y).toBeLessThanOrEqual(D.elev[1]);
      expect(it.colorIdx).toBeLessThan(6);
    }
  });
});
