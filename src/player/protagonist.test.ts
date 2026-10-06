import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import { allColors, JOINTS, PCOL, protagonistHeads, protagonistHeight } from '../data/protagonist';
import { advancePhase, blendPose, footDrop, REST_POSE, strideAmp, targetPose, type PoseInput } from './protagonistPose';

const C = VISUAL.character;
const idle: PoseInput = { speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 };

describe('protagonist data', () => {
  it('키가 약 1.8m, 7~8등신의 날씬한 비율', () => {
    const h = protagonistHeight();
    expect(h).toBeGreaterThan(1.75);
    expect(h).toBeLessThan(1.85);
    expect(protagonistHeads()).toBeGreaterThan(7);
    expect(protagonistHeads()).toBeLessThan(8.2);
  });
  it('모든 파츠 색은 일러스트에서 샘플링한 팔레트(PCOL) 값이다', () => {
    // M1h: 게임 환경 팔레트(COL) 파생 대신 사용자 일러스트의 COLOR PALETTE/본체 샘플 색을 데이터 팔레트로 쓴다
    const allowed = new Set<number>(Object.values(PCOL));
    for (const c of allColors()) expect(allowed.has(c), c.toString(16)).toBe(true);
  });
  it('일러스트 팔레트 근처: 셔츠 크림·바지 회갈·머리 거의 검정', () => {
    const near = (a: number, b: number, tol: number) =>
      [16, 8, 0].every((s) => Math.abs(((a >> s) & 255) - ((b >> s) & 255)) <= tol);
    expect(near(PCOL.shirt, 0xe8e0d4, 24)).toBe(true);
    expect(near(PCOL.slacks, 0x7a736c, 20)).toBe(true);
    expect(near(PCOL.hair, 0x1c1c20, 30)).toBe(true);
  });
  it('관절 길이 합 = 엉덩이 높이 (발바닥이 원점)', () => {
    expect(JOINTS.thighLen + JOINTS.shinLen).toBeCloseTo(JOINTS.hipY, 5);
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
  it('발 접지: 곧게 서면 오프셋 0, 굽히거나 스윙하면 몸이 내려가고 가장 낮은 발은 항상 땅에 닿는다', () => {
    const L1 = JOINTS.thighLen, L2 = JOINTS.shinLen;
    expect(footDrop({ ...REST_POSE }, L1, L2)).toBeCloseTo(0, 6);
    const stand = targetPose(idle, 0, 0);
    expect(footDrop(stand, L1, L2)).toBeLessThan(0);
    // 걷기 한 주기에서 접지: 몸을 내린 뒤 가장 낮은 발 끝 높이 = 0
    for (let ph = 0; ph < Math.PI * 2; ph += 0.3) {
      const p = targetPose({ ...idle, speed: 6 }, ph, 0);
      const drop = footDrop(p, L1, L2);
      const sole = (th: number, kn: number) => JOINTS.hipY - (L1 * Math.cos(th) + L2 * Math.cos(th - kn)) + drop; // 발바닥 y (hip 기준 → 월드)
      const lowest = Math.min(sole(p.thighL, p.kneeL), sole(p.thighR, p.kneeR));
      expect(lowest).toBeCloseTo(0, 6);
    }
  });
  it('비조준 시 팔을 살짝 벌리고 조준 중에는 곧게 뻗는다', () => {
    expect(targetPose(idle, 0, 0).armRz).toBeGreaterThan(0);
    expect(targetPose({ ...idle, aiming: true }, 0, 0).armRz).toBe(0);
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
