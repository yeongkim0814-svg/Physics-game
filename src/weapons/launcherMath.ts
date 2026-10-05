// 운동량 사출기의 순수 수식. 부작용 없음 → 단위 테스트 대상.

/** 반동 임펄스 크기 J = m·v·recoil·scale (N·s). 발사체 운동량 p=mv 의 반대 방향 */
export function recoilImpulse(mass: number, speed: number, recoil: number, scale: number): number {
  return mass * speed * recoil * scale;
}

/** 임펄스가 플레이어에게 주는 속도 변화 Δv = J / M (m/s) */
export function recoilDeltaV(impulse: number, playerMass: number): number {
  return impulse / playerMass;
}

/** 발사체 운동 에너지 E = ½mv² (J) */
export function projectileEnergy(mass: number, speed: number): number {
  return 0.5 * mass * speed * speed;
}

/** 현재 퍼짐 각(rad) = (기본 + 누적열) / (1 + 안정성), 상한 max */
export function currentSpread(base: number, heat: number, stability: number, max: number): number {
  return Math.min((base + heat) / (1 + Math.max(0, stability)), max);
}

/** 발사 후 누적열 증가. 상한은 max */
export function heatAfterShot(heat: number, perShot: number, max: number): number {
  return Math.min(heat + perShot, max);
}

/** 시간 경과에 따른 열 감소 (0 미만 없음) */
export function decayHeat(heat: number, recoverPerSec: number, dt: number): number {
  return Math.max(0, heat - recoverPerSec * dt);
}

/** 후방 슬롯 마모량 = 임펄스 × wearPerRecoil × 부품 마모율. 강하게 쏠수록 빨리 마모 */
export function rearWear(impulse: number, wearPerRecoil: number, wearRate: number): number {
  return impulse * wearPerRecoil * wearRate;
}

/**
 * 선분(origin + dir·t, 0≤t≤len)과 구의 첫 교차 t. 없으면 null.
 * dir 은 단위벡터. 시작점이 구 내부면 0.
 */
export function segmentSphereToi(
  origin: [number, number, number], dir: [number, number, number], len: number,
  center: [number, number, number], radius: number,
): number | null {
  const ox = origin[0] - center[0], oy = origin[1] - center[1], oz = origin[2] - center[2];
  const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= len ? t : null;
}
