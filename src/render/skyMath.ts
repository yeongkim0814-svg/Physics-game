/** 낮 하늘 그라디언트 순수 계산 (정점색·안개색 일치 검증용) */
export interface SkyColors { zenith: number; mid: number; horizon: number; gradientPower: number }

export function mixHex(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** elev = 고도 sin 값 (0 = 지평선, 1 = 천정, 음수 = 지평선 색). 지평선 → 중간 → 천정 */
export function skyColorAt(elev: number, c: SkyColors): number {
  if (elev <= 0) return c.horizon;
  const u = Math.pow(Math.min(1, elev), c.gradientPower);
  return u < 0.5 ? mixHex(c.horizon, c.mid, u * 2) : mixHex(c.mid, c.zenith, (u - 0.5) * 2);
}
