/** 낙하 피해 = (착지 하강 속도 − 안전 속도) × 속도당 피해. 안전 속도 이하면 0 */
export function fallDamage(landingSpeed: number, safeSpeed: number, perSpeed: number): number {
  return Math.max(0, landingSpeed - safeSpeed) * perSpeed;
}
