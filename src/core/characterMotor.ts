import type { RAPIER } from './physics';
import { TUNING } from '../config/tuning';

type V3 = { x: number; y: number; z: number };
const P = TUNING.player;

/**
 * 캐릭터(플레이어/몹 공용) 충돌 이동 + 계단 오르기.
 * Rapier 내장 autostep 은 이 캡슐/계단 조합에서 동작하지 않아 직접 구현했다:
 * 수평 이동이 막히면 단차 높이만큼 띄워서 앞으로(stepProbe) 갈 수 있는지 보고,
 * 갈 수 있으면 올라서면서 이동량만큼만 전진한다.
 * 호출 후 controller 의 computedGrounded() 는 최종 이동 기준이 된다. collider 위치는 t 로 복구된다.
 */
export function moveCharacter(
  controller: RAPIER.KinematicCharacterController,
  collider: RAPIER.Collider,
  t: V3,
  desired: V3,
  grounded: boolean,
): V3 {
  controller.computeColliderMovement(collider, desired);
  const m: V3 = { ...controller.computedMovement() };
  if (!grounded) return m;

  const want = Math.hypot(desired.x, desired.z);
  const got = Math.hypot(m.x, m.z);
  if (want < 1e-4 || got > want * 0.5) return m;

  // 이번 프레임 이동량만으론 캡슐이 단 모서리에 닿지 못하므로 더 앞까지 띄워서 가보고 올라설 높이를 구한다
  const up = P.stepHeight;
  const probe = Math.max(want, P.stepProbe);
  const k = probe / want;
  collider.setTranslation({ x: t.x, y: t.y + up, z: t.z });
  controller.computeColliderMovement(collider, { x: desired.x * k, y: 0, z: desired.z * k });
  const fwd = { ...controller.computedMovement() };
  let result: V3 | null = null;
  if (Math.hypot(fwd.x, fwd.z) >= probe * 0.9) {
    collider.setTranslation({ x: t.x + fwd.x, y: t.y + up, z: t.z + fwd.z });
    controller.computeColliderMovement(collider, { x: 0, y: -(up + 0.02), z: 0 });
    const dy = up + controller.computedMovement().y;
    if (dy > 0.02 && controller.computedGrounded()) result = { x: desired.x, y: dy, z: desired.z };
  }
  // 원래 위치로 복구하고 grounded 상태가 원래 이동 기준이 되도록 재계산
  collider.setTranslation(t);
  controller.computeColliderMovement(collider, desired);
  return result ?? { ...controller.computedMovement() };
}
