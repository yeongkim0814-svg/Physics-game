import { describe, expect, it } from 'vitest';
import { clampCameraDistance, followFactor, lookDirection, orbitOffset, smoothDistance } from './cameraMath';

describe('lookDirection', () => {
  it('yaw=0,pitch=0 → -z', () => {
    const d = lookDirection(0, 0);
    expect(d.z).toBeCloseTo(-1); expect(d.x).toBeCloseTo(0); expect(d.y).toBeCloseTo(0);
  });
  it('pitch>0 은 위쪽, yaw>0 은 왼쪽(-x)', () => {
    expect(lookDirection(0, 0.5).y).toBeGreaterThan(0);
    expect(lookDirection(0.5, 0).x).toBeLessThan(0);
  });
  it('단위 벡터', () => {
    expect(lookDirection(1.2, -0.7).length()).toBeCloseTo(1);
  });
});

describe('orbitOffset', () => {
  it('yaw=0,pitch=0: 오른쪽 shoulder, 뒤(+z) distance', () => {
    const o = orbitOffset(0, 0, 0.5, 4);
    expect(o.x).toBeCloseTo(0.5); expect(o.y).toBeCloseTo(0); expect(o.z).toBeCloseTo(4);
  });
  it('위를 볼수록 카메라는 피벗보다 낮아진다 / 아래를 보면 높아진다', () => {
    expect(orbitOffset(0, 0.8, 0.5, 4).y).toBeLessThan(0);
    expect(orbitOffset(0, -0.8, 0.5, 4).y).toBeGreaterThan(0);
  });
  it('yaw=π: 시점 뒤쪽이 -z 쪽으로 돌아간다', () => {
    expect(orbitOffset(Math.PI, 0, 0, 4).z).toBeCloseTo(-4);
  });
  it('카메라는 항상 시점의 반대쪽(정면 반대)에 놓인다', () => {
    const o = orbitOffset(0.9, 0.4, 0, 4);
    const f = lookDirection(0.9, 0.4);
    expect(o.normalize().dot(f)).toBeCloseTo(-1);
  });
});

describe('clampCameraDistance', () => {
  it('가림 없음 → 원래 거리', () => expect(clampCameraDistance(4, null, 1)).toBe(4));
  it('가림 → 적중 거리', () => expect(clampCameraDistance(4, 2.2, 1)).toBe(2.2));
  it('minDistance 아래로 줄지 않음', () => expect(clampCameraDistance(4, 0.2, 1)).toBe(1));
  it('적중이 원래 거리보다 멀면 원래 거리', () => expect(clampCameraDistance(4, 9, 1)).toBe(4));
  it('want 가 min 보다 작으면 want', () => expect(clampCameraDistance(0.5, 0.1, 1)).toBe(0.5));
});

describe('smoothDistance', () => {
  it('줄어들 때는 즉시', () => expect(smoothDistance(4, 1.5, 6, 0.016)).toBe(1.5));
  it('늘어날 때는 천천히 목표에 접근, 넘지 않음', () => {
    const a = smoothDistance(1.5, 4, 6, 0.016);
    expect(a).toBeGreaterThan(1.5); expect(a).toBeLessThan(4);
    let d = 1.5;
    for (let i = 0; i < 600; i++) d = smoothDistance(d, 4, 6, 0.016);
    expect(d).toBeCloseTo(4, 3); expect(d).toBeLessThanOrEqual(4);
  });
});

describe('followFactor', () => {
  it('0..1 이고 dt 가 클수록 커진다', () => {
    expect(followFactor(10, 0)).toBe(0);
    expect(followFactor(10, 0.1)).toBeGreaterThan(followFactor(10, 0.01));
    expect(followFactor(10, 10)).toBeLessThanOrEqual(1);
  });
});
