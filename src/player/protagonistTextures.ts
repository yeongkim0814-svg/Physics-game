import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import faceUrl from '../assets/protagonist_face.png';

/**
 * 주인공 텍스처 2종.
 * - 얼굴: 사용자 제공 일러스트의 얼굴 크롭(128px, scripts/make_face_texture.py). CLAUDE.md 의 '주인공 얼굴 텍스처 1건' 예외. 선명하게(밉맵 없음, 확대는 linear).
 * - 천(셔츠·바지): 128px 타일링 절차 텍스처. 흰색 근처의 곱셈 무늬(미세 노이즈 + 주름선)라 정점색에 곱해진다. linear 필터로 부드럽게.
 */
const K = VISUAL.character.look;

export function faceTexture(): THREE.Texture {
  const tex = new THREE.TextureLoader().load(faceUrl);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** 결정적 난수 */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let fabric: THREE.Texture | undefined;
export function fabricTexture(): THREE.Texture {
  if (fabric) return fabric;
  const n = K.fabricSize;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const g = canvas.getContext('2d')!;
  const r = rng(K.seed * 977 + 3);
  // 바탕: 타일링 값 노이즈(8x8 격자) + 미세 입자
  const cells = 8, grid = Array.from({ length: cells * cells }, () => r());
  const gv = (x: number, y: number) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cells, fy = (y / n) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
      const u = fx - ix, v = fy - iy, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const lo = gv(ix, iy) * (1 - su) * (1 - sv) + gv(ix + 1, iy) * su * (1 - sv) + gv(ix, iy + 1) * (1 - su) * sv + gv(ix + 1, iy + 1) * su * sv;
      const val = 0.9 + (lo - 0.5) * 0.1 + (r() - 0.5) * 0.04;
      const o = (y * n + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(Math.min(1, val) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 주름선: 어두운 가는 곡선 + 옆의 밝은 하이라이트 (타일 경계를 넘어 감싼다)
  g.lineCap = 'round';
  const creases = 6;
  for (let i = 0; i < creases; i++) {
    const x0 = r() * n, y0 = r() * n, len = n * (0.25 + r() * 0.3), ang = -0.9 + r() * 1.8 + (i % 2 ? Math.PI / 2 : 0);
    const bend = (r() - 0.5) * n * 0.2;
    for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
      const ex = x0 + dx + Math.cos(ang) * len, ey = y0 + dy + Math.sin(ang) * len;
      const cx = (x0 + dx + ex) / 2 + bend, cy = (y0 + dy + ey) / 2 - bend;
      g.strokeStyle = 'rgba(70,60,50,0.11)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x0 + dx, y0 + dy); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + dx + 2, y0 + dy + 1.5); g.quadraticCurveTo(cx + 2, cy + 1.5, ex + 2, ey + 1.5); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  fabric = tex;
  return tex;
}
