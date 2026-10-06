import * as THREE from 'three';

/** dir 을 중심으로 반각 angle(rad) 원뿔 안에서 균일하게 흩뜨린 단위 방향. 사출기·코일 공용 */
export function perturbDirection(dir: THREE.Vector3, angle: number, rng: () => number = Math.random): THREE.Vector3 {
  if (angle <= 0) return dir.clone();
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, dir);
  const r = angle * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(realUp, Math.sin(a) * r).normalize();
}

/**
 * 3인칭 조준 (순수 계산). 조준선은 카메라 정면 중앙선이고, 발사는 총구에서 그 선이 닿은 목표점으로 향한다.
 *
 * 1) aimRayStart: 총구가 카메라 정면 방향으로 얼마나 앞에 있는가. 조준선은 그 깊이에서 시작해
 *    총구보다 뒤(카메라와 캐릭터 사이)의 지오메트리가 목표점이 되는 일을 막는다.
 * 2) aimTargetPoint: 레이 적중 거리(없으면 최대 사거리)로 목표점 계산
 * 3) muzzleDirection: 총구→목표점 단위 방향. 너무 가깝거나 카메라 정면에서 maxDeviation 이상 벌어지면 정면 쪽으로 제한
 */
export function aimRayStart(camPos: THREE.Vector3, camFwd: THREE.Vector3, muzzle: THREE.Vector3): number {
  return Math.max(0, muzzle.clone().sub(camPos).dot(camFwd));
}

/** hitToi: 조준 레이(시작점 = 카메라 + 정면*startDepth) 기준 적중 거리. 없으면 null → 카메라 기준 maxRange 의 점 */
export function aimTargetPoint(
  camPos: THREE.Vector3, camFwd: THREE.Vector3, startDepth: number, hitToi: number | null, maxRange: number,
): THREE.Vector3 {
  const depth = hitToi === null ? Math.max(maxRange, startDepth) : startDepth + hitToi;
  return camPos.clone().addScaledVector(camFwd, depth);
}

const MIN_AIM_DISTANCE = 1e-3;

export function muzzleDirection(
  muzzle: THREE.Vector3, target: THREE.Vector3, camFwd: THREE.Vector3, maxDeviation: number,
): THREE.Vector3 {
  const d = target.clone().sub(muzzle);
  if (d.length() < MIN_AIM_DISTANCE) return camFwd.clone();
  d.normalize();
  const angle = d.angleTo(camFwd);
  if (angle <= maxDeviation) return d;
  // camFwd 에서 d 쪽으로 maxDeviation 만큼만 회전
  const q = new THREE.Quaternion().setFromUnitVectors(camFwd, d);
  const limited = new THREE.Quaternion().slerp(q, maxDeviation / angle);
  return camFwd.clone().applyQuaternion(limited).normalize();
}
