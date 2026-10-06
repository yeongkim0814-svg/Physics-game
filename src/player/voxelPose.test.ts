import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import { footDrop, targetPose } from './protagonistPose';
import { VOXEL_FILE } from './voxelData';
import { approach, armTilt, sashAngles, skirtAngles, VOXEL_POSE_CONFIG } from './voxelPose';

const V = VISUAL.voxelCharacter;
const P = VOXEL_FILE.pivots;

describe('복셀 자세 계산', () => {
  it('자락: 앞으로 나간 다리만 앞자락을, 뒤로 간 다리만 뒷자락을 움직인다', () => {
    const a = skirtAngles({ thighL: 0.5, thighR: -0.5 }, 0.5);
    expect(a.front).toBeCloseTo(0.25, 5);
    expect(a.back).toBeCloseTo(-0.25, 5);
    const rest = skirtAngles({ thighL: 0, thighR: 0 }, 0.5);
    expect(rest.front).toBe(0);
    expect(Math.abs(rest.back)).toBe(0);
    const both = skirtAngles({ thighL: 0.4, thighR: 0.2 }, 0.5);
    expect(both.back).toBe(0);
  });
  it('천 자락: 정지 시 진폭이 작고 이동하면 커진다, 뒤로 날린다, 앞뒤 자락 위상이 다르다', () => {
    const maxAbs = (speed: number, back: boolean) => {
      let m = 0;
      for (let t = 0; t < 6; t += 0.02) m = Math.max(m, Math.abs(sashAngles(t, speed, back).z));
      return m;
    };
    expect(maxAbs(0, false)).toBeLessThan(maxAbs(6, false));
    let mean = 0;
    for (let t = 0; t < 6.28 / V.sash.rate; t += 0.01) mean += sashAngles(t, 6, false).x;
    expect(mean).toBeLessThan(0); // 평균적으로 아래 끝이 뒤(+z)로 날린다
    expect(sashAngles(1, 0, false).x).not.toBeCloseTo(sashAngles(1, 0, true).x, 4);
  });
  it('팔 기울기: 오른팔은 바깥(+x)으로 기울어 양의 각, 왼팔은 음 / 보간은 목표에 수렴', () => {
    expect(armTilt(P.shoulderR, P.elbowR)).toBeGreaterThan(0);
    expect(armTilt(P.shoulderL, P.elbowL)).toBeLessThan(0);
    expect(approach(0, 1, 100, 1)).toBeGreaterThan(0.99);
    expect(approach(0.5, 1, 10, 0)).toBe(0.5);
  });
  it('복셀 자세 설정은 공통 설정을 덮어쓰되 나머지는 유지', () => {
    expect(VOXEL_POSE_CONFIG.restLean).toBe(V.pose.restLean);
    expect(VOXEL_POSE_CONFIG.legSwing).toBe(VISUAL.character.legSwing);
  });
  it('도면 자세: 정지 시 무기 든 팔이 거의 늘어지고(장치가 허벅지 옆), 조준하면 수평으로 든다', () => {
    const idle = targetPose({ speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 }, 0, 0, VOXEL_POSE_CONFIG);
    const aim = targetPose({ speed: 0, grounded: true, aiming: true, vy: 0, aimPitch: 0 }, 0, 0, VOXEL_POSE_CONFIG);
    expect(idle.armR + idle.elbowR).toBeLessThan(0.4);
    expect(aim.armR + aim.elbowR).toBeCloseTo(VOXEL_POSE_CONFIG.aimArmBase, 5);
  });
  it('서 있을 때 발 접지 보정은 0 이하', () => {
    const hipY = P.hipR[1], kneeY = P.kneeR[1];
    expect(hipY).toBeGreaterThan(kneeY);
    const p = targetPose({ speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 }, 0, 0, VOXEL_POSE_CONFIG);
    expect(footDrop(p, hipY - kneeY, kneeY)).toBeLessThanOrEqual(1e-9);
  });
});
