import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aimRayStart, aimTargetPoint, muzzleDirection } from './aim';
import { recoilImpulse } from './launcherMath';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const FWD = v(0, 0, -1);

describe('aimRayStart', () => {
  it('총구의 카메라 정면 방향 깊이', () => {
    expect(aimRayStart(v(0, 2, 4), FWD, v(0.3, 1.5, 0))).toBeCloseTo(4);
  });
  it('총구가 카메라 뒤면 0', () => {
    expect(aimRayStart(v(0, 2, 0), FWD, v(0, 2, 1))).toBe(0);
  });
});

describe('aimTargetPoint', () => {
  it('적중 시: 시작 깊이 + toi', () => {
    const t = aimTargetPoint(v(0, 2, 4), FWD, 4, 10, 120);
    expect(t.z).toBeCloseTo(-10);
    expect(t.y).toBeCloseTo(2);
  });
  it('적중 없음: 카메라 기준 최대 사거리의 먼 점', () => {
    const t = aimTargetPoint(v(0, 2, 4), FWD, 4, null, 120);
    expect(t.z).toBeCloseTo(4 - 120);
  });
});

describe('muzzleDirection', () => {
  it('총구에서 목표점 방향 단위 벡터', () => {
    const d = muzzleDirection(v(0.5, 1.4, 0), v(0, 1.4, -20), FWD, 1);
    expect(d.length()).toBeCloseTo(1);
    expect(d.x).toBeLessThan(0); // 오른쪽 어깨 총구 → 중앙 목표: 왼쪽으로 약간 수렴
    expect(d.angleTo(FWD)).toBeCloseTo(Math.atan(0.5 / 20), 4);
  });
  it('먼 목표에서는 카메라 정면과 거의 평행', () => {
    const d = muzzleDirection(v(0.5, 1.4, 0), v(0, 1.4, -120), FWD, 1);
    expect(d.angleTo(FWD)).toBeLessThan(0.005);
  });
  it('너무 가까운 목표로 급각도가 되면 maxDeviation 으로 제한', () => {
    const d = muzzleDirection(v(0.5, 1.4, 0), v(-0.5, 1.4, -0.1), FWD, 0.5);
    expect(d.angleTo(FWD)).toBeCloseTo(0.5, 5);
    expect(d.length()).toBeCloseTo(1);
    expect(d.x).toBeLessThan(0);
  });
  it('가까운 목표(nearDistance 안)는 카메라 정면 쪽으로 섞인다', () => {
    const muzzle = v(0.34, 0.6, 0), target = v(0.55, 0, -0.7);
    const raw = muzzleDirection(muzzle, target, FWD, 1);
    const blended = muzzleDirection(muzzle, target, FWD, 1, 3);
    expect(blended.angleTo(FWD)).toBeLessThan(raw.angleTo(FWD));
    expect(blended.length()).toBeCloseTo(1);
  });
  it('nearDistance 이상 멀면 섞지 않는다', () => {
    const muzzle = v(0.34, 1.2, 0), target = v(0.55, 1.2, -10);
    expect(muzzleDirection(muzzle, target, FWD, 1, 3).distanceTo(muzzleDirection(muzzle, target, FWD, 1))).toBeCloseTo(0);
  });
  it('목표가 총구와 같은 점이면 카메라 정면', () => {
    const d = muzzleDirection(v(1, 1, 1), v(1, 1, 1), FWD, 0.5);
    expect(d.equals(FWD)).toBe(true);
  });
});

describe('반동 방향 (발사 방향의 반대)', () => {
  const J = recoilImpulse(2, 40, 1, 7.5);
  const recoil = (dir: THREE.Vector3) => dir.clone().multiplyScalar(-J);

  it('바닥(아래)을 향해 쏘면 위로 튄다', () => {
    const dir = muzzleDirection(v(0.3, 1.2, 0), v(0, 0, -3), v(0, -0.6, -0.8).normalize(), 0.5);
    expect(recoil(dir).y).toBeGreaterThan(0);
  });
  it('뒤(+z)로 쏘면 앞(-z)으로 밀린다', () => {
    const back = v(0, 0, 1);
    const dir = muzzleDirection(v(0.3, 1.2, -0.5), v(0, 1.2, 30), back, 0.5);
    expect(recoil(dir).z).toBeLessThan(0);
  });
  it('임펄스 크기는 방향과 무관하게 J', () => {
    const dir = muzzleDirection(v(0.5, 1.4, 0), v(-2, 3, -6), FWD, 0.5);
    expect(recoil(dir).length()).toBeCloseTo(J);
  });
});
