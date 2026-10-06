// 떠 있는 파편 배치 (순수 계산, 시각 전용). 결정적 난수.
import { mulberry } from './decor';

export interface DebrisCfg {
  count: number; seed: number; ring: readonly [number, number]; elev: readonly [number, number];
  size: readonly [number, number]; spin: number; bobAmp: number; bobSpeed: number; big: number; bigScale: number;
}
export interface DebrisItem {
  x: number; y: number; z: number;
  /** 각 축 크기 (m) */ sx: number; sy: number; sz: number;
  /** 회전축(단위벡터)과 초기 각, 각속도(rad/s) */ axis: [number, number, number]; angle0: number; spin: number;
  bobPhase: number; colorIdx: number;
}

/** 맵 중심 기준 수평 거리 ring, 높이 elev 의 고리 안에 count 개 (앞 big 개는 크고 길쭉한 부유 바위) */
export function debrisPlacement(c: DebrisCfg, colorCount: number): DebrisItem[] {
  const r = mulberry(c.seed), out: DebrisItem[] = [];
  for (let i = 0; i < c.count; i++) {
    const az = r() * Math.PI * 2, rad = c.ring[0] + Math.sqrt(r()) * (c.ring[1] - c.ring[0]);
    const big = i < c.big;
    const s = c.size[0] + r() * (c.size[1] - c.size[0]);
    const k = big ? c.bigScale : 1;
    const ax = [r() - 0.5, r() - 0.5, r() - 0.5] as [number, number, number];
    const len = Math.hypot(...ax) || 1;
    out.push({
      x: Math.cos(az) * rad, z: Math.sin(az) * rad, y: c.elev[0] + r() * (c.elev[1] - c.elev[0]),
      sx: s * k * (0.7 + r() * 0.6), sy: s * k * (big ? 1.2 + r() * 0.8 : 0.6 + r() * 0.7), sz: s * k * (0.7 + r() * 0.6),
      axis: [ax[0] / len, ax[1] / len, ax[2] / len], angle0: r() * Math.PI * 2, spin: (r() - 0.5) * 2 * c.spin * (big ? 0.3 : 1),
      bobPhase: r() * Math.PI * 2, colorIdx: Math.floor(r() * colorCount) % Math.max(1, colorCount),
    });
  }
  return out;
}

/** 시각 t(초) 의 수직 부유 오프셋 (m) */
export function bobOffset(it: DebrisItem, t: number, amp: number, speed: number): number {
  return Math.sin(t * speed * Math.PI * 2 + it.bobPhase) * amp;
}
