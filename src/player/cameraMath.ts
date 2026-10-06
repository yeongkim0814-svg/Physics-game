import * as THREE from 'three';

/** 시점(yaw, pitch; 위쪽 +)의 정면 단위 벡터. yaw=0 → -z */
export function lookDirection(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}

/** 피벗에서 카메라까지의 궤도 오프셋: 시점 기준 오른쪽 shoulder, 뒤쪽 distance (pitch 를 올리면 카메라는 아래로) */
export function orbitOffset(yaw: number, pitch: number, shoulder: number, distance: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(shoulder, 0, distance).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}

/** 충돌 결과로 정한 카메라 거리: 적중 거리(없으면 want)를 [min, want] 로 제한 */
export function clampCameraDistance(want: number, hit: number | null, min: number): number {
  const lo = Math.min(min, want);
  return hit === null ? want : Math.min(want, Math.max(lo, hit));
}

/** 거리 보간: 줄어들 때는 즉시(벽을 뚫지 않게), 늘어날 때만 rate(초당 지수 감쇠)로 천천히 */
export function smoothDistance(cur: number, target: number, rate: number, dt: number): number {
  if (target <= cur) return target;
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/** 지수 감쇠 추적 계수 (0..1) */
export function followFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
