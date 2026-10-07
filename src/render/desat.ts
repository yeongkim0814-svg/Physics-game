/**
 * 탈색(채도 낮춤) 순수 계산. 셰이더(materials.ts 의 DESAT_GLSL)와 같은 식이며 단위 테스트로 고정한다.
 * "색이 정보다": 이상 지역은 채도를 낮추고, 해결하면 원래 색이 돌아온다.
 */
export const DESAT_MAX_REGIONS = 4;
/** 지역 탈색 [x, z, 반경 m, 강도 0~1] */
export type DesatRegion = readonly [number, number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  if (b <= a) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 색의 채도를 amount(0=원색, 1=완전 회색) 만큼 휘도 쪽으로 보낸다 */
export function desaturateHex(hex: number, amount: number): number {
  const a = clamp01(amount);
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c: number) => Math.round(c + (l - c) * a);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** (x, z) 에서의 지역 탈색 강도: 각 지역 안쪽은 강도 그대로, 반경 가장자리(softness 비율)에서 0 으로 부드럽게 줄고 겹치면 최대값 */
export function regionDesatAmount(x: number, z: number, regions: readonly DesatRegion[], softness: number): number {
  let best = 0;
  for (const [cx, cz, radius, amount] of regions.slice(0, DESAT_MAX_REGIONS)) {
    if (radius <= 0) continue;
    const d = Math.hypot(x - cx, z - cz);
    best = Math.max(best, amount * (1 - smoothstep(radius * (1 - softness), radius, d)));
  }
  return clamp01(best);
}
