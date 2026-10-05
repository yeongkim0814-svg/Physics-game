import * as THREE from 'three';
import { VISUAL } from '../config/settings';

/** 코드로 생성하는 저해상도 텍스처. nearest 필터 + 반복. 종류별 캐시. */
export type TexKind = 'dirt' | 'concrete' | 'rust' | 'metal' | 'water' | 'tile';

const PAL: Record<TexKind, string[]> = {
  dirt:     ['#6a5a46', '#5a4c3b', '#786650', '#4a3e30'],
  concrete: ['#8a8e8b', '#797d7a', '#999d99', '#686b69'],
  rust:     ['#6e4a2e', '#7d5232', '#58381f', '#8a5a34'],
  metal:    ['#6f7882', '#5f6872', '#7f8892', '#4f5760'],
  water:    ['#1d3f6e', '#244c82', '#173660', '#2d5a94'],
  tile:     ['#5a6560', '#4c5651', '#66716b', '#3f4843'],
};

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<TexKind, THREE.Texture>();

export function getTexture(kind: TexKind): THREE.Texture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const n = VISUAL.textureSize;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const r = rng([...kind].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const pal = PAL[kind];
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(((x % n) + n) % n, ((y % n) + n) % n, 1, 1); };

  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(x, y, pal[Math.floor(r() * pal.length)]);
  // 얼룩(오염): 어두운 덩어리
  for (let i = 0; i < n / 3; i++) {
    const bx = r() * n, by = r() * n, bw = 2 + r() * 5, bh = 2 + r() * 4;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(bx, by, bw, bh);
  }
  if (kind === 'concrete' || kind === 'tile') {
    // 균열: 랜덤 워크
    for (let k = 0; k < 2; k++) {
      let x = r() * n, y = r() * n;
      for (let s = 0; s < n * 0.8; s++) {
        px(Math.floor(x), Math.floor(y), '#1c1d1c');
        x += r() < 0.5 ? 1 : 0; y += r() < 0.5 ? 1 : -1 + (r() < 0.5 ? 1 : 0);
      }
    }
  }
  if (kind === 'tile') {
    for (let i = 0; i < n; i++) { px(i, 0, '#262b28'); px(0, i, '#262b28'); px(i, n / 2, '#262b28'); px(n / 2, i, '#262b28'); }
  }
  if (kind === 'metal') {
    for (let i = 0; i < n; i++) { px(i, 0, '#2a3036'); px(i, n / 2, '#2a3036'); }
    for (const [x, y] of [[2, 2], [n - 3, 2], [2, n / 2 + 2], [n - 3, n / 2 + 2]]) px(x, y, '#9aa4ae');
    for (let i = 0; i < n; i++) px(Math.floor(r() * n), Math.floor(r() * n), '#8a5a34'); // 녹 점
  }
  if (kind === 'rust') {
    for (let i = 0; i < n * 2; i++) px(Math.floor(r() * n), Math.floor(r() * n), '#2c1a0e');
  }
  if (kind === 'water') {
    for (let y = 0; y < n; y += 4) for (let x = 0; x < n; x++) px(x, y + Math.round(Math.sin(x * 0.7) * 1), '#4a7fbe');
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(kind, tex);
  return tex;
}
