import { hash2 } from './tint';

/**
 * 저해상도 절차 텍스처 (그래픽 기준 v2 G3). 외부 파일 없이 코드로 생성, 시드 고정.
 * RGB = 명도 변화(128 = 중립, 재질이 (rgb-0.5)·2·amp 만큼 알베도에 곱한다), A = 기술 발광 마스크(255 = 청록 발광선).
 */
export type TexKind = 'grain' | 'stone' | 'metal' | 'tech';
export const TEX_KINDS: readonly TexKind[] = ['grain', 'stone', 'metal', 'tech'];

const NEUTRAL = 128;
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** 한 종류의 n×n RGBA 픽셀. 행 0 이 아래(v=0) */
export function texKindPixels(kind: TexKind, n: number, seed: number): Uint8Array {
  const px = new Uint8Array(n * n * 4);
  const set = (x: number, y: number, lum: number, a = 0) => {
    const i = (y * n + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = clamp(lum);
    px[i + 3] = a;
  };
  const noise = (x: number, y: number, amp: number, s: number) => (hash2(x, y, seed + s) - 0.5) * 2 * amp;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (kind === 'grain') {
        const r = hash2(x, y, seed + 1);
        set(x, y, NEUTRAL + noise(x, y, 12, 2) + (r < 0.06 ? -42 : r > 0.96 ? 30 : 0));
      } else if (kind === 'stone') {
        const course = n / 4, row = Math.floor(y / course), off = row % 2 ? n / 4 : 0;
        const bx = Math.floor((x + off) / (n / 2));
        const mortar = y % course === 0 || (x + off) % (n / 2) === 0;
        const base = (hash2(bx, row, seed + 3) - 0.5) * 28;
        const crack = hash2(x, y, seed + 4) > 0.985 ? -34 : 0;
        set(x, y, mortar ? NEUTRAL - 48 : NEUTRAL + base + noise(x, y, 6, 5) + crack);
      } else {
        const p = n / 2, lx = x % p, ly = y % p;
        const seam = lx === p - 1 || ly === p - 1 ? -44 : lx === 0 || ly === 0 ? 20 : 0;
        const rivet = [2, p - 3].some((a) => [2, p - 3].some((b) => lx === a && ly === b)) ? 56 : 0;
        let lum = NEUTRAL + seam + rivet + noise(x, y, kind === 'metal' ? 7 : 4, 6) + (hash2(0, y, seed + 7) - 0.5) * 10;
        let a = 0;
        if (kind === 'tech') {
          // 회로선: 패널마다 가로 2줄(끊김 있음) + 세로 가지 + 노드 점
          const trace = (ly === Math.floor(p / 4) || ly === Math.floor((3 * p) / 4)) && hash2(Math.floor(lx / 4), Math.floor(y / p), seed + 8) > 0.3;
          const branch = lx === Math.floor(p / 2) && ly > p / 4 && ly < (3 * p) / 4;
          const node = (lx === Math.floor(p / 2) || lx === Math.floor(p / 2) + 1) && (ly === Math.floor(p / 4) || ly === Math.floor(p / 4) + 1);
          if (trace || branch || node) { a = 255; lum += 70; }
        }
        set(x, y, lum, a);
      }
    }
  }
  return px;
}

/** 모든 종류를 세로로 쌓은 아틀라스 픽셀 (n × n·K, 층 순서 = TEX_KINDS) */
export function atlasPixels(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n * n * TEX_KINDS.length * 4);
  TEX_KINDS.forEach((k, i) => out.set(texKindPixels(k, n, seed), i * n * n * 4));
  return out;
}

/** 기술 발광 맥동 배율: 1 ± amp 사인파 (전도체 단서는 장식보다 밝고 맥동한다) */
export function pulseScale(t: number, amp: number, rate: number): number {
  return 1 + amp * Math.sin(t * rate * Math.PI * 2);
}
