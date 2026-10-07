import { describe, expect, it } from 'vitest';
import { frameDt } from './frameDt';

describe('frameDt', () => {
  it('정상 프레임은 초 단위로 환산', () => expect(frameDt(1016, 1000, 0.05)).toBeCloseTo(0.016, 10));
  it('음수(첫 프레임 타임스탬프가 last 보다 앞섬)는 0 — 시간이 거꾸로 흐르지 않는다', () => {
    expect(frameDt(400, 1012, 0.05)).toBe(0);
    expect(frameDt(999.99, 1000, 0.05)).toBe(0);
  });
  it('긴 정지는 maxDt 로 제한', () => expect(frameDt(5000, 1000, 0.05)).toBe(0.05));
});
