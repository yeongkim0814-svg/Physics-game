import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { segmentedBox } from './boxGeometry';

/**
 * 로우폴리 정점색: 텍스처 없이 면에 명도 변화를 준다.
 * - 월드 위치 기반 낮은 주파수 값 노이즈(타일 경계에서도 이어짐)
 * - 밑동으로 갈수록 먼지색이 번지는 그라디언트 (오래된 건물/땅 느낌, 간이 AO 대용)
 */
export interface TintOpts {
  noiseAmp: number; noiseScale: number; seed: number;
  bottomColor: number; bottomBlend: number; bottomHeight: number;
}

/** 정수 격자 해시 → 0~1 (결정적) */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 부드러운(쌍선형 smoothstep) 값 노이즈 0~1 */
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/**
 * 정점 하나의 곱셈 색 (r,g,b). 노이즈로 ±noiseAmp 명도, 월드 높이 wy 가 bottomHeight 보다 낮은 밑동(지면 근처·협곡 벽)에서는
 * bottomColor 쪽으로 bottomBlend 만큼 섞는다.
 */
export function tintColor(wx: number, wy: number, wz: number, t: TintOpts): [number, number, number] {
  const n = (valueNoise(wx * t.noiseScale + wy * t.noiseScale * 0.7, wz * t.noiseScale, t.seed) - 0.5) * 2 * t.noiseAmp;
  const f = 1 + n;
  const w = t.bottomBlend * Math.min(1, Math.max(0, 1 - wy / Math.max(1e-3, t.bottomHeight)));
  const br = ((t.bottomColor >> 16) & 255) / 255, bg = ((t.bottomColor >> 8) & 255) / 255, bb = (t.bottomColor & 255) / 255;
  return [f * (1 + (br - 1) * w), f * (1 + (bg - 1) * w), f * (1 + (bb - 1) * w)];
}

/** 박스 지오메트리에 정점색(color 속성)을 입힌다. center = 월드 중심 */
export function applyBoxTint(geo: THREE.BufferGeometry, center: readonly [number, number, number], t: TintOpts = VISUAL.lowpoly.tint) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // 윗면(법선이 위)은 먼지 번짐 없이 노이즈만: 밑동 먼지색은 세로 면(벽·협곡 절벽)에만
    const topFace = nrm.getY(i) > 0.5;
    const [r, g, b] = tintColor(pos.getX(i) + center[0], y + center[1], pos.getZ(i) + center[2], topFace ? { ...t, bottomBlend: 0 } : t);
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** 로우폴리 박스: maxSegment(m) 이하로 분할하고 정점색을 입혀 월드 위치로 옮긴다 (플랫 셰이딩은 재질이 담당) */
export function lowpolyBox(pos: readonly [number, number, number], size: readonly [number, number, number], maxSegment: number) {
  const geo = segmentedBox(size[0], size[1], size[2], maxSegment);
  applyBoxTint(geo, pos);
  geo.translate(pos[0], pos[1], pos[2]);
  return geo;
}
