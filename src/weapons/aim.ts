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
