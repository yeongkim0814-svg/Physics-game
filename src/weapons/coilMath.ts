// 전자기 코일의 순수 수식 (부작용 없음 → 단위 테스트 대상)

export type Vec3 = [number, number, number];

/** 충전량 진행: dt/chargeTime 만큼 증가, 상한 max */
export function chargeStep(charge: number, dt: number, chargeTime: number, max: number): number {
  return Math.min(max, charge + dt / chargeTime);
}

/** 방출 피해 = maxDamage × 충전량 (충전량 1.0 = 최대 위력, 과충전이면 그 이상) */
export function arcDamage(maxDamage: number, charge: number): number {
  return maxDamage * charge;
}

/** 과충전 정도 0..1: at 이하 0, max 에서 1 */
export function overchargeFraction(charge: number, at: number, max: number): number {
  if (max <= at) return 0;
  return Math.min(1, Math.max(0, (charge - at) / (max - at)));
}

/** 과충전 방출 시 전방 슬롯 마모량 */
export function overchargeWear(fraction: number, wearOvercharge: number, wearRate: number): number {
  return fraction * wearOvercharge * wearRate;
}

/**
 * a→b 를 잇는 지그재그 번개 경로. 끝점은 정확히 a, b 이고 중간 점만 직선에서 수직 방향으로 amp 이내로 흔들린다
 * (양끝에서 0, 가운데에서 최대인 sin 포락선). 점 개수 = segments + 1.
 */
export function jaggedPath(a: Vec3, b: Vec3, segments: number, amp: number, rng: () => number): Vec3[] {
  const n = Math.max(1, Math.floor(segments));
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (len < 1e-6) return [a, b];
  const u: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  // u 에 수직인 두 축
  const ref: Vec3 = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const p1: Vec3 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
  const l1 = Math.hypot(...p1);
  const e1: Vec3 = [p1[0] / l1, p1[1] / l1, p1[2] / l1];
  const e2: Vec3 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
  const out: Vec3[] = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t) * amp;
    const o1 = (rng() * 2 - 1) * env, o2 = (rng() * 2 - 1) * env;
    out.push([
      a[0] + d[0] * t + e1[0] * o1 + e2[0] * o2,
      a[1] + d[1] * t + e1[1] * o1 + e2[1] * o2,
      a[2] + d[2] * t + e1[2] * o1 + e2[2] * o2,
    ]);
  }
  out.push(b);
  return out;
}

/** p 에서 maxDist 이내이면서 가장 가까운 항목 (없으면 null). filter 로 후보를 거를 수 있다 */
export function nearestWithin<T extends { position: { x: number; y: number; z: number } }>(
  p: { x: number; y: number; z: number }, items: T[], maxDist: number, filter?: (t: T) => boolean,
): T | null {
  let best: T | null = null;
  let bestD = maxDist;
  for (const it of items) {
    if (filter && !filter(it)) continue;
    const d = Math.hypot(it.position.x - p.x, it.position.y - p.y, it.position.z - p.z);
    if (d <= bestD) { bestD = d; best = it; }
  }
  return best;
}
