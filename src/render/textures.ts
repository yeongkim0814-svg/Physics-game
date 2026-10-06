import * as THREE from 'three';
import { COL, SKY } from './palette';
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

const rgba = (hex: number, a = 1) => {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
};
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  g.fillStyle = color;
  g.fillRect(Math.floor(x), Math.floor(y), w, h);
};
/** 모서리를 감싸며(타일링) 점 찍기: 가장자리 이음새가 어긋나지 않게 */
const wrapPx = (g: CanvasRenderingContext2D, n: number, x: number, y: number, w: number, h: number, color: string) => {
  g.fillStyle = color;
  g.fillRect(((Math.floor(x) % n) + n) % n, ((Math.floor(y) % n) + n) % n, w, h);
};

/** 모래/먼지 바닥: 따뜻한 모래 + 밝은 먼지·어두운 자갈 점 + 엇갈린 포석 줄눈 + 줄눈 속 이끼 */
export function floorTexture() {
  return mkTexture('floor', (g, r) => {
    const n = VISUAL.textureSize;
    px(g, 0, 0, n, n, rgba(COL.sand));
    // 먼지(밝음)·자갈(어두움) 점
    for (let i = 0; i < n * 3; i++) wrapPx(g, n, r() * n, r() * n, r() > 0.8 ? 2 : 1, 1, rgba(COL.dust, 0.55));
    for (let i = 0; i < n * 2; i++) wrapPx(g, n, r() * n, r() * n, 1, 1, rgba(COL.sandDark, 0.5));
    for (let i = 0; i < n / 4; i++) wrapPx(g, n, r() * n, r() * n, 2, 1, rgba(COL.grout, 0.5)); // 작은 돌
    // 엇갈린 포석 줄눈 (원경 모아레를 줄이려 옅게): 가로줄 2개, 세로 이음은 줄마다 반 칸 어긋남
    const rows = 2, rh = n / rows, cw = n / 2;
    for (let j = 0; j < rows; j++) {
      px(g, 0, j * rh, n, 1, rgba(COL.grout, 0.4));
      for (let i = 0; i < 2; i++) px(g, i * cw + (j % 2) * (cw / 2), j * rh, 1, rh, rgba(COL.grout, 0.4));
    }
    // 줄눈 속 이끼 몇 점
    for (let i = 0; i < n / 8; i++) {
      const j = Math.floor(r() * rows);
      wrapPx(g, n, r() * n, j * rh + 1, 1, 1, rgba(COL.moss, 0.7));
    }
  });
}

/** 청회색 벽돌 (줄눈=남보라) + 벽돌마다 명도 차 + 윗면 하이라이트 + 아래쪽에 이끼 */
export function wallTexture(tunnelable = false) {
  const key = tunnelable ? 'wall_tunnel' : 'wall';
  return mkTexture(key, (g, r) => {
    const n = VISUAL.textureSize;
    const bh = n / 8, bw = n / 4; // 벽돌 높이/너비 (8줄 × 4장)
    px(g, 0, 0, n, n, rgba(COL.grout));
    const tones = [COL.stone, COL.stone, COL.stoneLight, COL.stoneDark];
    for (let j = 0; j < 8; j++) {
      const off = (j % 2) * (bw / 2);
      for (let i = -1; i < 4; i++) {
        const x0 = i * bw + off, y0 = j * bh;
        const tone = tones[Math.floor(r() * tones.length)];
        // 줄눈 1px 을 남기고 채운다 (타일 경계를 넘는 벽돌은 감싸서 그린다)
        wrapPx(g, n, x0 + 1, y0 + 1, bw - 1, bh - 1, rgba(tone));
        wrapPx(g, n, x0 + 1, y0 + 1, bw - 1, 1, rgba(COL.stoneLight, 0.55)); // 윗면 하이라이트
        wrapPx(g, n, x0 + 1, y0 + bh - 1, bw - 1, 1, rgba(COL.stoneDark, 0.6)); // 아랫면 그늘
        if (r() > 0.6) wrapPx(g, n, x0 + 2 + r() * (bw - 4), y0 + 2 + r() * (bh - 4), 1, 1, rgba(COL.grout, 0.7)); // 흠집
      }
    }
    // 이끼: 아래쪽일수록 많고, 줄눈을 따라 번진다
    for (let i = 0; i < n * 1.2; i++) {
      const y = n * (0.35 + 0.65 * Math.sqrt(r()));
      if (r() < (y / n) * 0.9) wrapPx(g, n, r() * n, y, r() > 0.7 ? 2 : 1, 1, rgba(COL.moss, r() > 0.5 ? 0.9 : 0.6));
    }
    // 터널링 표시: 청록 줄무늬
    if (tunnelable) {
      for (let i = 0; i < n; i += n * 0.2) px(g, i - 1, 0, 2, n, rgba(COL.cyan));
    }
  });
}

export function ceilingTexture() {
  return mkTexture('ceiling', (g, _r) => {
    const n = VISUAL.textureSize;
    const base = hexToRgb(COL.shade);
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

/** 구리 패널: 어두운 구리 + 패널 이음 + 리벳 + 위 이음에서 흘러내린 녹청(전도체 청록 발광은 재질 emissive 가 담당) */
export function metalTexture() {
  return mkTexture('metal', (g, r) => {
    const n = VISUAL.textureSize;
    const half = n / 2;
    px(g, 0, 0, n, n, rgba(COL.copperDark));
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const x0 = i * half, y0 = j * half;
        px(g, x0 + 2, y0 + 2, half - 3, half - 3, rgba(COL.copper, 0.28 + 0.1 * ((i + j) % 2)));
        px(g, x0 + 2, y0 + 2, half - 3, 1, rgba(COL.copper, 0.7)); // 윗변 광택
        for (const [rx, ry] of [[3, 3], [half - 4, 3], [3, half - 4], [half - 4, half - 4]]) {
          px(g, x0 + rx, y0 + ry, 2, 2, rgba(COL.cream, 0.8)); // 리벳
        }
      }
    }
    px(g, 0, 0, n, 1, rgba(COL.shade)); px(g, 0, half, n, 1, rgba(COL.shade));
    px(g, 0, 0, 1, n, rgba(COL.shade)); px(g, half, 0, 1, n, rgba(COL.shade));
    // 녹청 줄기
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * n), y = (r() > 0.5 ? 1 : half + 1), len = 4 + Math.floor(r() * (half * 0.6));
      px(g, x, y, 1, Math.min(len, n - y), rgba(COL.verdigris, 0.65));
    }
    // 스크래치
    for (let i = 0; i < 6; i++) wrapPx(g, n, r() * n, r() * n, 2 + Math.floor(r() * 4), 1, rgba(COL.copper, 0.6));
  });
}

export function waterTexture() {
  return mkTexture('water', (g, r) => {
    const n = VISUAL.textureSize;
    const base = hexToRgb(COL.shade);
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

/** 하늘 텍스처(등장방형): 위 남보라 → 지평선 호박, 바이어 디더 띠, 별, 보랏빛 구름, 태양 방향 노을 번짐. 지평선 아래는 안개색 */
export function skyTexture(sunAzimuth: number, horizonBelow: number) {
  return mkSky('sky', sunAzimuth, horizonBelow);
}

function mkSky(name: string, sunAzimuth: number, horizonBelow: number): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const S = VISUAL.sky;
  const W = S.texWidth, H = S.texHeight, half = H / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  const r = rng(20240601);
  const stops = [SKY.horizon, SKY.low, SKY.mid, SKY.high, SKY.zenith].map(hexToRgb);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const e = Math.max(0, (half - y) / half); // 0 지평선 .. 1 천정
    for (let x = 0; x < W; x++) {
      let c: { r: number; g: number; b: number };
      if (y >= half) {
        c = hexToRgb(horizonBelow);
      } else {
        // 구면 u → 방위각. 태양 방위 근처일수록 지평선 색이 더 높이까지 올라온다
        const az = (x / W) * Math.PI * 2;
        const glow = Math.pow(Math.max(0, Math.cos(az - sunAzimuth)), S.glowPower) * S.glowAmount;
        const t = Math.pow(e, S.gradientPower) * (1 - glow);
        const f = Math.max(0, Math.min(1, t)) * (stops.length - 1);
        const i0 = Math.min(stops.length - 2, Math.floor(f));
        const frac = f - i0;
        const a = stops[i0], b = stops[i0 + 1]; // 단계 디더는 후처리(바이어 4x4, 16단계)가 맡는다
        c = { r: a.r + (b.r - a.r) * frac, g: a.g + (b.g - a.g) * frac, b: a.b + (b.b - a.b) * frac };
      }
      const o = (y * W + x) * 4;
      img.data[o] = c.r; img.data[o + 1] = c.g; img.data[o + 2] = c.b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 구름: 얇은 보랏빛 띠 (아래쪽 가장자리는 노을빛)
  for (let i = 0; i < S.cloudCount; i++) {
    const cx = r() * W, cy = half * (1 - (S.cloudBandLo + r() * (S.cloudBandHi - S.cloudBandLo)));
    const w = S.cloudWidth * (0.6 + r() * 0.8), rows = S.cloudRows + Math.floor(r() * S.cloudRows);
    for (let j = 0; j < rows; j++) {
      const rw = w * (1 - Math.abs(j - rows / 2) / rows) * (0.7 + r() * 0.3);
      const color = j === rows - 1 ? rgba(SKY.low, 0.9) : rgba(SKY.cloud, 0.85);
      for (const dx of [0, -W, W]) px(g, cx - rw / 2 + dx, cy + j, rw, 1, color);
    }
  }
  // 별: 구면에 고르게 (고도 starMinElev 이상). 극 쪽 가로 늘어남을 줄이려고 고도 sin 값을 균등 추첨
  const sMin = Math.sin(S.starMinElev);
  for (let i = 0; i < S.starCount; i++) {
    const elev = Math.asin(sMin + (S.starMaxSin - sMin) * r());
    const y = Math.floor(half * (1 - elev / (Math.PI / 2))), x = Math.floor(r() * W);
    px(g, x, y, 1, 1, rgba(SKY.star, 0.5 + r() * 0.5));
    if (r() > 0.85) { px(g, x + 1, y, 1, 1, rgba(SKY.star, 0.4)); px(g, x, y + 1, 1, 1, rgba(SKY.star, 0.4)); }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  cache.set(name, tex);
  return tex;
}
