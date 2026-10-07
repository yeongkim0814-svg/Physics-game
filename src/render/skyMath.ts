/** 하늘 그라디언트·태양 번짐 순수 계산 (정점색·안개색 일치 검증용) */
export interface SkyColors { zenith: number; mid: number; horizon: number; low?: number; gradientPower: number }
export interface SkyGlow { color: number; power: number; amount: number }

export function mixHex(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * elev = 고도 sin 값 (0 = 지평선, 1 = 천정, 음수 = 지평선 색). 지평선 → (low) → 중간 → 천정.
 * low 가 있으면 4단 그라디언트(균등 간격 u = elev^power), 없으면 3단.
 */
export function skyColorAt(elev: number, c: SkyColors): number {
  if (elev <= 0) return c.horizon;
  const u = Math.pow(Math.min(1, elev), c.gradientPower);
  if (c.low !== undefined) {
    if (u < 1 / 3) return mixHex(c.horizon, c.low, u * 3);
    return u < 2 / 3 ? mixHex(c.low, c.mid, u * 3 - 1) : mixHex(c.mid, c.zenith, u * 3 - 2);
  }
  return u < 0.5 ? mixHex(c.horizon, c.mid, u * 2) : mixHex(c.mid, c.zenith, (u - 0.5) * 2);
}

/** 정점 방향(단위벡터)과 해 방향(단위벡터)의 내적으로 번짐을 얹은 색: 각 겹마다 dot^power × amount 만큼 glow 색으로 */
export function skyColorWithGlow(base: number, dot: number, glows: readonly SkyGlow[]): number {
  let c = base;
  const d = Math.max(0, dot);
  for (const g of glows) c = mixHex(c, g.color, Math.pow(d, g.power) * g.amount);
  return c;
}
