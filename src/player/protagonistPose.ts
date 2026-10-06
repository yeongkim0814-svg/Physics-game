import { VISUAL } from '../config/settings';
import { TUNING } from '../config/tuning';
import type { CharacterState } from './CharacterModel';

/**
 * 주인공 절차 자세의 순수 계산 (THREE 비의존 → 단위 테스트 가능).
 * 각도 rad. 부호 규약: 다리·팔·팔꿈치·무릎은 +가 "앞(-z)"으로 스윙 (무릎은 -가 아니라 +굽힘이며 모델이 정강이를 뒤로 접는다),
 * lean + 는 상체가 앞으로 숙임, headPitch + 는 고개를 듦.
 */
export interface Pose {
  thighL: number; thighR: number; kneeL: number; kneeR: number;
  armL: number; armLz: number; elbowL: number;
  armR: number; armRz: number; elbowR: number;
  lean: number; headPitch: number; bob: number;
  /** 가슴 부피 비율 (1 = 기본). 숨쉬기 */
  chest: number;
}

/** 자세 설정 형식: VISUAL.character 의 리터럴 타입을 number 로 넓힌 것 (복셀 주인공이 일부 값을 덮어쓸 수 있게) */
type Widen<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? Widen<T[K]> : T[K] };
export type PoseConfig = Widen<typeof VISUAL.character>;
type Cfg = PoseConfig;
export type PoseInput = Pick<CharacterState, 'speed' | 'grounded' | 'aiming' | 'vy' | 'aimPitch'>;

export const REST_POSE: Pose = {
  thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, armL: 0, armLz: 0, elbowL: 0, armR: 0, armRz: 0, elbowR: 0,
  lean: 0, headPitch: 0, bob: 0, chest: 1,
};

/** 걸음 위상 누적: 땅에 있을 때만 속도에 비례해 진행 */
export function advancePhase(phase: number, speed: number, grounded: boolean, dt: number, C: Cfg = VISUAL.character): number {
  return grounded ? phase + speed * C.strideRate * dt : phase;
}

/** 이동 진폭 0..1.4 (걷기 속도 = 1) */
export function strideAmp(speed: number, moveSpeed: number = TUNING.player.moveSpeed): number {
  return Math.min(speed / moveSpeed, 1.4);
}

/** 이번 프레임에 자세가 향할 목표. phase = 걸음 위상, idleT = 누적 시간(숨쉬기) */
export function targetPose(st: PoseInput, phase: number, idleT: number, C: Cfg = VISUAL.character, moveSpeed: number = TUNING.player.moveSpeed): Pose {
  const amp = strideAmp(st.speed, moveSpeed);
  const walk = Math.min(amp, 1);        // 0 = 정지, 1 = 걷기 속도 이상
  const breath = Math.sin(idleT * C.breathRate) * (1 - walk); // 움직이면 숨쉬기 모션은 걸음에 묻힌다
  const sw = Math.sin(phase) * amp;
  const cw = Math.cos(phase);

  const p: Pose = { ...REST_POSE };
  p.chest = 1 + breath * C.breathAmp;
  let lean = C.restLean + C.runLean * amp + breath * C.breathAmp * 0.8;

  if (st.grounded) {
    // 정지 시 무릎을 굽힌 서기, 걸을수록 곧게 펴고 스윙: 허벅지 rest = 무릎의 절반 (발이 엉덩이 아래로 돌아온다)
    const stand = 1 - walk * 0.5;
    const thighRest = (C.kneeRest / 2) * stand;
    const kneeRest = C.kneeRest * stand;
    p.thighL = thighRest + sw * C.legSwing;
    p.thighR = thighRest - sw * C.legSwing;
    p.kneeL = kneeRest + C.kneeWalk * amp * Math.max(0, cw);
    p.kneeR = kneeRest + C.kneeWalk * amp * Math.max(0, -cw);
    p.armL = C.leftArmRest - sw * C.armSwing + breath * 0.03;
    p.armLz = -C.armRestOut; // 허리 파우치를 비켜 가게 살짝 벌린 팔 (왼쪽은 -z 가 바깥)
    p.elbowL = C.leftElbowRest + Math.max(0, p.armL - C.leftArmRest) * C.leftElbowSwing;
    p.bob = Math.abs(cw) * C.bob * amp;
  } else {
    p.thighL = C.airLeg; p.thighR = -C.airLeg * 0.5;
    p.kneeL = C.airKnee; p.kneeR = C.airKnee * 0.4;
    p.armL = -0.4; p.armLz = -C.airArm; p.elbowL = C.leftElbowRest;
    lean += Math.max(0, Math.min(1, -st.vy / C.leanVy)) * C.fallLean;
  }

  // 무기 든 팔: 어깨+팔꿈치 각의 합이 곧 총신 방향. 조준하면 수평+pitch, 아니면 앞으로 기운 채 약하게 스윙
  const total = st.aiming
    ? C.aimArmBase + st.aimPitch
    : C.restArm + (st.grounded ? sw * C.armSwing * 0.3 : 0);
  p.elbowR = st.aiming ? C.weaponElbowAim : C.weaponElbowRest;
  p.armR = total - p.elbowR;
  p.armRz = st.aiming ? 0 : C.armRestOut * 0.6;

  // 고개: 상체 숙임을 대부분 상쇄해 정면을 보고, 조준 시 카메라 pitch 를 일부 따라간다
  p.lean = lean;
  p.headPitch = lean * C.headCounter + (st.aiming ? st.aimPitch * C.headAimFollow : 0);
  return p;
}

/** 현재 자세를 목표로 지수 보간 (k = followFactor) */
export function blendPose(cur: Pose, target: Pose, k: number): void {
  for (const key of Object.keys(cur) as (keyof Pose)[]) cur[key] += (target[key] - cur[key]) * k;
}

/**
 * 발 접지: 다리가 굽거나 스윙해 발이 엉덩이 아래로 짧아지면 몸 전체를 그만큼 내려, 가장 낮은 발이 땅에 닿게 한다.
 * 다리 하나의 수직 길이 = thighLen·cos(허벅지) + shinLen·cos(허벅지 - 무릎) (무릎은 정강이를 뒤로 접으므로 부호 -).
 * 반환 = body y 오프셋 (≤ 0). 걷기 중 스윙 정점에서 발이 뜨거나 땅에 파묻히지 않게 한다.
 */
export function footDrop(p: Pose, thighLen: number, shinLen: number): number {
  const ext = (th: number, kn: number) => thighLen * Math.cos(th) + shinLen * Math.cos(th - kn);
  return Math.max(ext(p.thighL, p.kneeL), ext(p.thighR, p.kneeR)) - (thighLen + shinLen);
}
