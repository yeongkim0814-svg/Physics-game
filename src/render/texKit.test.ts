import { describe, expect, it } from 'vitest';
import { atlasPixels, pulseScale, TEX_KINDS, texKindPixels } from './texKit';

const N = 32;
const lumMean = (px: Uint8Array) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i]; return s / (px.length / 4); };

describe('절차 텍스처 (G3)', () => {
  it('결정적: 같은 시드는 같은 픽셀, 다른 시드는 다른 픽셀', () => {
    expect(texKindPixels('stone', N, 7)).toEqual(texKindPixels('stone', N, 7));
    expect(texKindPixels('stone', N, 7)).not.toEqual(texKindPixels('stone', N, 8));
  });
  it('크기 n·n·4, 평균 명도는 중립(128) 근처 (알베도를 눈에 띄게 밀지 않는다)', () => {
    for (const k of TEX_KINDS) {
      const px = texKindPixels(k, N, 7);
      expect(px.length).toBe(N * N * 4);
      expect(Math.abs(lumMean(px) - 128)).toBeLessThan(14);
    }
  });
  it('발광 마스크(A)는 tech 에만 있고 선이 가늘다 (전체의 5~35%)', () => {
    for (const k of TEX_KINDS) {
      const px = texKindPixels(k, N, 7);
      let lit = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
      const ratio = lit / (N * N);
      if (k === 'tech') { expect(ratio).toBeGreaterThan(0.05); expect(ratio).toBeLessThan(0.35); } else expect(lit).toBe(0);
    }
  });
  it('석재 줄눈은 벽돌보다 어둡다', () => {
    const px = texKindPixels('stone', N, 7);
    const at = (x: number, y: number) => px[(y * N + x) * 4];
    expect(at(5, 0)).toBeLessThan(at(5, 3) - 20); // 층 경계 행 vs 벽돌 안쪽
  });
  it('아틀라스: 층 순서 = TEX_KINDS, 층별 픽셀이 단독 생성과 일치', () => {
    const atlas = atlasPixels(N, 7);
    expect(atlas.length).toBe(N * N * TEX_KINDS.length * 4);
    TEX_KINDS.forEach((k, i) => expect(atlas.subarray(i * N * N * 4, (i + 1) * N * N * 4)).toEqual(texKindPixels(k, N, 7)));
  });
});

describe('기술 발광 맥동 (G9)', () => {
  it('1±amp 범위, t=0 에서 1, 주기 1/rate', () => {
    expect(pulseScale(0, 0.35, 2)).toBeCloseTo(1, 10);
    expect(pulseScale(0.125, 0.35, 2)).toBeCloseTo(1.35, 10);
    expect(pulseScale(0.5, 0.35, 2)).toBeCloseTo(1, 10);
    for (let t = 0; t < 3; t += 0.07) {
      const v = pulseScale(t, 0.35, 2);
      expect(v).toBeGreaterThanOrEqual(0.65 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.35 + 1e-9);
    }
  });
});
