import * as THREE from 'three';
import { COL } from './palette';
import { VISUAL } from '../config/settings';

/**
 * 절차 생성 텍스처. 팔레트 색상 + 패턴으로 구성. nearest + repeat.
 */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, THREE.Texture>();

function mkTexture(name: string, fn: (c: CanvasRenderingContext2D, r: () => number) => void): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const n = VISUAL.textureSize;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const g = canvas.getContext('2d')!;
  const r = rng([...name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  fn(g, r);
  const tex = new THREE.CanvasTexture(canvas);
  // 가까이(확대)는 nearest 로 픽셀 느낌 유지, 멀리(축소)는 밉맵으로 평균내 번쩍임/모아레 제거
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(name, tex);
  return tex;
}

function hexToRgb(h: number) {
  return { r: (h >> 16) & 255, g: (h >> 8) & 255, b: h & 255 };
}

export function floorTexture() {
  return mkTexture('floor', (g, r) => {
    const n = VISUAL.textureSize;
    const mid = hexToRgb(COL.floorTile);
    g.fillStyle = `rgb(${mid.r},${mid.g},${mid.b})`;
    g.fillRect(0, 0, n, n);
    // 그레인: 어두운 점
    for (let i = 0; i < n / 2; i++) {
      const c = hexToRgb(COL.grout);
      g.fillStyle = `rgba(${c.r},${c.g},${c.b},0.4)`;
      g.fillRect(Math.floor(r() * n), Math.floor(r() * n), Math.random() > 0.7 ? 2 : 1, 1);
    }
    // 타일 그리드: 그레인 라인
    const step = n / 4;
    g.strokeStyle = `rgba(${hexToRgb(COL.grout).r},${hexToRgb(COL.grout).g},${hexToRgb(COL.grout).b},0.45)`; // 원경 모아레를 줄이려 줄눈을 옅게
    g.lineWidth = 1;
    for (let i = step; i < n; i += step) {
      g.strokeRect(0, i - 0.5, n, 1);
      g.strokeRect(i - 0.5, 0, 1, n);
    }
  });
}

export function wallTexture(tunnelable = false) {
  const key = tunnelable ? 'wall_tunnel' : 'wall';
  return mkTexture(key, (g, r) => {
    const n = VISUAL.textureSize;
    const base = hexToRgb(COL.oliveMid);
    g.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    g.fillRect(0, 0, n, n);
    // 패널 이음: 수직 선
    g.strokeStyle = `rgb(${hexToRgb(COL.oliveDark).r},${hexToRgb(COL.oliveDark).g},${hexToRgb(COL.oliveDark).b})`;
    g.lineWidth = 1;
    for (let i = n * 0.4; i < n; i += n * 0.5) g.strokeRect(i - 0.5, 0, 1, n);
    // 리벳: 밝은 점
    const rivet = hexToRgb(COL.aluminum);
    g.fillStyle = `rgb(${rivet.r},${rivet.g},${rivet.b})`;
    for (let y = n * 0.25; y < n; y += n * 0.3) {
      for (let x = n * 0.2; x < n; x += n * 0.4) {
        g.fillRect(x, y, 2, 2);
      }
    }
    // 물때: 어두운 줄
    for (let i = 0; i < n; i += Math.max(2, Math.floor(r() * 4))) {
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(0, i, n, 1);
    }
    // 터널링 표시: 청록 줄무늬
    if (tunnelable) {
      g.strokeStyle = `rgb(${hexToRgb(COL.cyan).r},${hexToRgb(COL.cyan).g},${hexToRgb(COL.cyan).b})`;
      g.lineWidth = 2;
      for (let i = 0; i < n; i += n * 0.2) g.strokeRect(i - 1, 0, 2, n);
    }
  });
}

export function ceilingTexture() {
  return mkTexture('ceiling', (g, _r) => {
    const n = VISUAL.textureSize;
    const base = hexToRgb(COL.oliveDark);
    g.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    g.fillRect(0, 0, n, n);
    // 60cm 격자(내부 해상도 비율로)
    g.strokeStyle = `rgb(${hexToRgb(COL.grout).r},${hexToRgb(COL.grout).g},${hexToRgb(COL.grout).b})`;
    g.lineWidth = 1;
    const step = n * 0.3;
    for (let i = step; i < n; i += step) {
      g.strokeRect(0, i - 0.5, n, 1);
      g.strokeRect(i - 0.5, 0, 1, n);
    }
    // 판금 질감: 어두운 음영
    for (let y = 0; y < n; y += step) {
      for (let x = 0; x < n; x += step) {
        g.fillStyle = (Math.floor(x / step) + Math.floor(y / step)) % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';
        g.fillRect(x, y, step, step);
      }
    }
  });
}

export function metalTexture() {
  return mkTexture('metal', (g, r) => {
    const n = VISUAL.textureSize;
    const base = hexToRgb(COL.steelDark);
    g.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    g.fillRect(0, 0, n, n);
    // 스크래치: 밝은 선
    g.strokeStyle = `rgb(${hexToRgb(COL.aluminum).r},${hexToRgb(COL.aluminum).g},${hexToRgb(COL.aluminum).b})`;
    g.lineWidth = 1;
    for (let i = 0; i < n; i += Math.max(3, Math.floor(r() * 8))) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(Math.min(n, i + Math.floor(r() * n * 0.4)), n);
      g.stroke();
    }
  });
}

export function waterTexture() {
  return mkTexture('water', (g, r) => {
    const n = VISUAL.textureSize;
    const base = hexToRgb(COL.oliveDark);
    g.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    g.fillRect(0, 0, n, n);
    // 잔물결: 청록 가로줄 (전도체 = cyan)
    const c = hexToRgb(COL.cyan);
    for (let y = 1; y < n; y += 4) {
      g.fillStyle = `rgba(${c.r},${c.g},${c.b},0.55)`;
      for (let x = 0; x < n; x++) g.fillRect(x, y + Math.round(Math.sin(x * 0.8 + y) * 1), 1, 1);
    }
    for (let i = 0; i < n; i++) { // 반짝임
      g.fillStyle = `rgba(${c.r},${c.g},${c.b},0.9)`;
      g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1);
    }
  });
}
