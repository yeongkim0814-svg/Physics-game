// 지형 노이즈 (순수 계산, 시드 결정적). 그라디언트 노이즈 + fBm + 릿지 + 도메인 워프.
import { hash3 } from '../blockTerrain';

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D 그라디언트(퍼린) 노이즈, 대략 [-1, 1] */
export function gradNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const g = (cx: number, cz: number, dx: number, dz: number) => {
    const a = hash3(cx, cz, 17, seed) * 6.283185307;
    return Math.cos(a) * dx + Math.sin(a) * dz;
  };
  const u = fade(fx), v = fade(fz);
  const n00 = g(ix, iz, fx, fz), n10 = g(ix + 1, iz, fx - 1, fz);
  const n01 = g(ix, iz + 1, fx, fz - 1), n11 = g(ix + 1, iz + 1, fx - 1, fz - 1);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.4142; // 최대 ±0.707 → ±1
}

/** fBm [0, 1] (옥타브마다 주파수 ×2, 진폭 ×gain). 입력 좌표는 이미 스케일된 값 */
export function fbm01(x: number, z: number, seed: number, octaves: number, gain = 0.5): number {
  let amp = 1, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * gradNoise(x * f + o * 19.7, z * f - o * 31.3, seed + o * 101);
    norm += amp; amp *= gain; f *= 2;
  }
  return Math.min(1, Math.max(0, 0.5 + 0.5 * (sum / norm)));
}

/** 릿지 fBm [0, 1]: 능선(날카로운 마루)이 선으로 이어진다 */
export function ridged01(x: number, z: number, seed: number, octaves: number, gain = 0.5): number {
  let amp = 1, sum = 0, norm = 0, f = 1, w = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(gradNoise(x * f + o * 7.1, z * f + o * 13.9, seed + o * 57));
    n *= n;
    n *= w; w = Math.min(1, Math.max(0, n * 1.6));
    sum += amp * n; norm += amp; amp *= gain; f *= 2;
  }
  return Math.min(1, sum / norm);
}

/** 도메인 워프: 좌표를 노이즈로 밀어 직선 윤곽을 구불거리게 한다. amp 는 m 단위 이동량 */
export function warp(x: number, z: number, scale: number, amp: number, seed: number): [number, number] {
  const wx = gradNoise(x / scale, z / scale, seed) * amp;
  const wz = gradNoise(x / scale + 41.3, z / scale - 17.9, seed + 7) * amp;
  return [x + wx, z + wz];
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
