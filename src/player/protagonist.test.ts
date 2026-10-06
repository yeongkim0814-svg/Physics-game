import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import { COL } from '../render/palette';
import { ALL_PARTS, PCOL, protagonistHeight } from '../data/protagonist';
import { advancePhase, blendPose, REST_POSE, strideAmp, targetPose, type PoseInput } from './protagonistPose';

const C = VISUAL.character;
const idle: PoseInput = { speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 };

describe('protagonist data', () => {
  it('키가 약 1.8m 근처 (구부정 숙임 전 기준)', () => {
    const h = protagonistHeight();
    expect(h).toBeGreaterThan(1.7);
    expect(h).toBeLessThan(1.9);
  });
  it('모든 파츠 색은 게임 팔레트 또는 파생색(PCOL)', () => {
    const allowed = new Set<number>([...Object.values(COL), ...Object.values(PCOL)]);
    for (const p of ALL_PARTS) expect(allowed.has(p.color), p.name).toBe(true);
  });
  it('파츠 치수는 모두 양수', () => {
    for (const p of ALL_PARTS) for (const s of p.size) expect(s).toBeGreaterThan(0);
  });
});

describe('protagonist pose', () => {
  it('정지: 구부정(상체 숙임) + 무릎 굽힘 + 고개는 숙임을 대부분 상쇄', () => {
    const p = targetPose(idle, 0, 0);
    expect(p.lean).toBeCloseTo(C.restLean, 5);
    expect(p.kneeL).toBeCloseTo(C.kneeRest, 5);
    expect(p.thighL).toBeCloseTo(C.kneeRest / 2, 5);
    expect(p.headPitch).toBeCloseTo(C.restLean * C.headCounter, 5);
    expect(p.thighL).toBeCloseTo(p.thighR, 5);
  });
  it('숨쉬기: 정지에서만 가슴이 변하고 주기적', () => {
    const a = targetPose(idle, 0, Math.PI / 2 / C.breathRate);
    const b = targetPose(idle, 0, (3 * Math.PI) / 2 / C.breathRate);
    expect(a.chest).toBeGreaterThan(1);
    expect(b.chest).toBeLessThan(1);
    const run = targetPose({ ...idle, speed: 6 }, 1, Math.PI / 2 / C.breathRate);
    expect(run.chest).toBeCloseTo(1, 5);
  });
  it('걷기: 좌우 다리가 반대로 스윙하고 앞 다리만 무릎을 더 굽힘', () => {
    const p = targetPose({ ...idle, speed: 6 }, Math.PI / 2, 0);
    expect(p.thighL - p.thighR).toBeGreaterThan(0);
    expect(p.thighL + p.thighR).toBeCloseTo(2 * (C.kneeRest / 4), 5); // 평균 = 걷기 중 rest 의 절반 비율
    const q = targetPose({ ...idle, speed: 6 }, 0, 0); // cos=1 → 왼다리 무릎 접힘
    expect(q.kneeL).toBeGreaterThan(q.kneeR);
  });
  it('달릴수록 더 숙인다', () => {
    expect(targetPose({ ...idle, speed: 9 }, 0, 0).lean).toBeGreaterThan(targetPose(idle, 0, 0).lean);
  });
  it('공중: 다리 벌림·팔 벌림, 낙하 속도에 따라 더 숙임', () => {
    const air: PoseInput = { ...idle, grounded: false };
    const p = targetPose(air, 0, 0);
    expect(p.thighL).toBeCloseTo(C.airLeg, 5);
    expect(p.armLz).toBeCloseTo(-C.airArm, 5);
    expect(targetPose({ ...air, vy: -C.leanVy }, 0, 0).lean).toBeCloseTo(C.restLean + C.fallLean, 5);
    expect(targetPose({ ...air, vy: 5 }, 0, 0).lean).toBeCloseTo(C.restLean, 5);
  });
  it('조준: 어깨+팔꿈치 합 = 수평 + pitch (총신이 조준 방향)', () => {
    const p = targetPose({ ...idle, aiming: true, aimPitch: 0.3 }, 0, 0);
    expect(p.armR + p.elbowR).toBeCloseTo(C.aimArmBase + 0.3, 5);
    const rest = targetPose(idle, 0, 0);
    expect(rest.armR + rest.elbowR).toBeCloseTo(C.restArm, 5);
  });
  it('위상은 땅에서만 진행, 보간은 목표로 수렴', () => {
    expect(advancePhase(1, 6, false, 0.1)).toBe(1);
    expect(advancePhase(0, 6, true, 0.1)).toBeCloseTo(6 * C.strideRate * 0.1, 5);
    const cur = { ...REST_POSE };
    const tgt = targetPose(idle, 0, 0);
    for (let i = 0; i < 200; i++) blendPose(cur, tgt, 0.2);
    expect(cur.lean).toBeCloseTo(tgt.lean, 4);
    expect(strideAmp(100)).toBe(1.4);
  });
});
