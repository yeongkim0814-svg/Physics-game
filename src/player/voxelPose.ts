import { TUNING } from '../config/tuning';
import { VISUAL } from '../config/settings';
import type { Pose, PoseConfig } from './protagonistPose';
import { strideAmp } from './protagonistPose';
import type { V3 } from './voxelCodec';

/**
 * 복셀 주인공 전용 순수 계산 (THREE 비의존, 단위 테스트 대상).
 * 걷기·공중·조준·반동·숨쉬기 자체는 protagonistPose.ts(targetPose)를 재사용하고, 여기서는 그 위에 얹는 부분만 다룬다:
 * 도면 자세에 맞춘 설정 덮어쓰기, 실험복 자락의 다리 추종, 어깨 천 자락 살랑임, 팔의 도면 기울기 상쇄.
 */
const V = VISUAL.voxelCharacter;

/** 공통 자세 설정 + 복셀 주인공 덮어쓰기 */
export const VOXEL_POSE_CONFIG: PoseConfig = { ...VISUAL.character, ...V.pose };

/**
 * 실험복 아랫단 앞/뒤 자락 각 (rad, +가 앞으로 들림). 앞자락은 앞으로 나간 다리를, 뒷자락은 뒤로 간 다리를 따라 들린다.
 * 한쪽 다리만 앞으로 가도 반대쪽 자락은 움직이지 않는다 (max/min).
 */
export function skirtAngles(pose: Pick<Pose, 'thighL' | 'thighR'>, follow: number = V.skirtFollow): { front: number; back: number } {
  return {
    front: Math.max(0, pose.thighL, pose.thighR) * follow,
    back: Math.min(0, pose.thighL, pose.thighR) * follow,
  };
}

export interface SashAngles { x: number; z: number }
/** 천 자락 살랑임 설정 (voxelCharacter.sash 와 같은 형식, 다른 캐릭터가 값만 바꿔 재사용) */
export interface SashConfig { rate: number; ampIdle: number; ampMove: number; windBack: number; sideRatio: number; phaseBack: number }

/**
 * 어깨 천 자락 각 (rad). t = 누적 시간, speed = 수평 속력, back = 뒷자락 여부.
 * 진폭 = 정지 진폭 → 이동 진폭 (속도 비례), 이동하면 천이 뒤로 날린다(windBack, x 가 음수 = 아래 끝이 뒤로).
 */
export function sashAngles(t: number, speed: number, back: boolean, S: SashConfig = V.sash, moveSpeed: number = TUNING.player.moveSpeed): SashAngles {
  const amp = Math.min(speed / moveSpeed, 1.4);
  const a = S.ampIdle + (S.ampMove - S.ampIdle) * Math.min(amp, 1);
  const ph = back ? S.phaseBack : 0;
  return {
    x: -S.windBack * Math.min(amp, 1.4) * (back ? 0.7 : 1) + Math.sin(t * S.rate + ph) * a,
    z: Math.sin(t * S.rate * 0.8 + ph * 1.3 + 1) * a * S.sideRatio,
  };
}

/** 도면에서 팔이 몸 바깥으로 기울어진 각 (rad, 어깨→아래 끝 벡터의 +x 쪽 기울기, 부호 포함). 조준 시 이만큼 반대로 돌려 곧게 뻗게 한다 */
export function armTilt(shoulder: V3, tip: V3): number {
  return Math.atan2(tip[0] - shoulder[0], shoulder[1] - tip[1]);
}

/** 조준 보간값 k(0..1)를 목표로 지수 접근 */
export function approach(k: number, target: number, rate: number, dt: number): number {
  return k + (target - k) * (1 - Math.exp(-rate * dt));
}

/** 이동 진폭 (재노출: 테스트 편의) */
export { strideAmp };
