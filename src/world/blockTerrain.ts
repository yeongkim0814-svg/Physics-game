// 블록 지형 생성기 (M1i, 순수 계산: THREE 의존 없음 → 단위 테스트 대상).
// 박스의 각 면을 N×N 타일로 쪼개 타일마다 색(명도±·색조 약간 이동)을 흔든 "정점색 모자이크" 메시 데이터를 만든다.
// 플랫 셰이딩은 재질이 담당하므로 면(삼각형)마다 법선이 따로 나오는 비색인 삼각형 목록을 낸다.
// 윗면은 이끼 혼합(확률), 측면은 밑동으로 갈수록 어두운 그늘 그라디언트. 시드 기반 결정적 난수.

export type V3 = [number, number, number];
export type FaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
export type PaletteKey = 'rock' | 'earth' | 'cliff';

export interface TerrainLook {
  palettes: { rock: number[]; earth: number[]; cliff: number[]; moss: number[] };
  lightAmp: number; hueMix: number;
  mossTop: number; mossSide: number; mossStrength: [number, number];
  bottomShade: number; shadeHeight: number;
}

export interface BoxSpec {
  pos: V3; size: V3;
  palette: PaletteKey;
  /** 타일 한 변 길이(m) 목표. 실제는 면 길이를 ceil(len/tile) 등분 (최소 1, maxTiles 이하) */
  tile: number;
  /** 만들 면. 기본: 아래를 뺀 5면 */
  faces?: Partial<Record<FaceKey, boolean>>;
  /** 이끼 확률 배율 (0 = 이끼 없음) */
  mossScale?: number;
}

export interface MeshData { positions: Float32Array; normals: Float32Array; colors: Float32Array }

const ALL_FACES: FaceKey[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const DEFAULT_FACES: Record<FaceKey, boolean> = { px: true, nx: true, py: true, ny: false, pz: true, nz: true };

/** 정수 3개 + 시드 → 0~1 (결정적 해시) */
export function hash3(a: number, b: number, c: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const unpack = (hex: number): V3 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** 박스 하나의 위치에서 얻는 정수 시드 (같은 위치·크기는 같은 모자이크) */
export function boxSeed(pos: V3, size: V3, seed: number): number {
  const q = (v: number) => Math.round(v * 8);
  return Math.floor(hash3(q(pos[0]) + q(size[0]) * 7, q(pos[1]) + q(size[1]) * 13, q(pos[2]) + q(size[2]) * 29, seed) * 2147483647);
}

/**
 * 타일 색 (0~1 RGB, 곱하기 전 기준색). 팔레트에서 하나 고르고 이웃 팔레트색 쪽으로 hueMix 만큼 섞은 뒤(색조 이동)
 * 명도 ±lightAmp, 이끼 확률이면 이끼색과 섞는다.
 */
export function tileColor(look: TerrainLook, palette: PaletteKey, bs: number, face: number, i: number, j: number, top: boolean, mossScale = 1): V3 {
  const pal = look.palettes[palette];
  const h0 = hash3(i, j, face, bs), h1 = hash3(i + 71, j + 13, face, bs), h2 = hash3(i + 5, j + 91, face, bs), h3 = hash3(i + 33, j + 47, face, bs);
  const a = unpack(pal[Math.floor(h0 * pal.length) % pal.length]);
  const b = unpack(pal[Math.floor(h1 * pal.length) % pal.length]);
  let c = mix3(a, b, h1 * look.hueMix);
  const light = 1 + (h2 - 0.5) * 2 * look.lightAmp;
  c = [c[0] * light, c[1] * light, c[2] * light];
  const mossP = (top ? look.mossTop : look.mossSide) * mossScale;
  if (look.palettes.moss.length && h3 < mossP) {
    const m = unpack(look.palettes.moss[Math.floor(hash3(i, j, face + 9, bs) * look.palettes.moss.length) % look.palettes.moss.length]);
    const k = look.mossStrength[0] + (look.mossStrength[1] - look.mossStrength[0]) * hash3(i + 3, j + 3, face + 3, bs);
    c = mix3(c, m, k);
  }
  return c;
}

/** 측면 정점 명도 배율: 박스 밑동에서 shadeHeight(m) 까지 bottomShade → 1 */
export function sideShade(yAboveBase: number, look: TerrainLook): number {
  if (look.bottomShade >= 1) return 1;
  return look.bottomShade + (1 - look.bottomShade) * smooth(yAboveBase / Math.max(1e-3, look.shadeHeight));
}

/** 면 길이를 타일 개수로 (1 ≤ n ≤ maxTiles) */
export function tileCount(len: number, tile: number, maxTiles: number): number {
  return Math.min(maxTiles, Math.max(1, Math.ceil(len / Math.max(1e-3, tile) - 1e-6)));
}

interface FaceDef { key: FaceKey; origin: V3; u: V3; v: V3; n: V3; top: boolean; uLen: number; vLen: number }

function faceDefs(pos: V3, size: V3): FaceDef[] {
  const [cx, cy, cz] = pos, [sx, sy, sz] = size, hx = sx / 2, hy = sy / 2, hz = sz / 2;
  return [
    { key: 'py', origin: [cx - hx, cy + hy, cz + hz], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], top: true, uLen: sx, vLen: sz },
    { key: 'ny', origin: [cx - hx, cy - hy, cz - hz], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], top: false, uLen: sx, vLen: sz },
    { key: 'px', origin: [cx + hx, cy - hy, cz + hz], u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0], top: false, uLen: sz, vLen: sy },
    { key: 'nx', origin: [cx - hx, cy - hy, cz - hz], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0], top: false, uLen: sz, vLen: sy },
    { key: 'pz', origin: [cx - hx, cy - hy, cz + hz], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], top: false, uLen: sx, vLen: sy },
    { key: 'nz', origin: [cx + hx, cy - hy, cz - hz], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], top: false, uLen: sx, vLen: sy },
  ];
}

/** 박스 목록의 삼각형 수 예측 (생성 없이) */
export function estimateTriangles(boxes: readonly BoxSpec[], maxTiles: number): number {
  let n = 0;
  for (const b of boxes) {
    const faces = { ...DEFAULT_FACES, ...b.faces };
    for (const f of faceDefs(b.pos, b.size)) {
      if (faces[f.key]) n += 2 * tileCount(f.uLen, b.tile, maxTiles) * tileCount(f.vLen, b.tile, maxTiles);
    }
  }
  return n;
}

/**
 * 박스들을 하나의 비색인 삼각형 메시 데이터로 만든다 (타일마다 색 하나 + 측면은 정점별 밑동 그늘).
 * 삼각형 순서는 면 바깥에서 보아 반시계(CCW).
 */
export function buildBlockMesh(boxes: readonly BoxSpec[], look: TerrainLook, maxTiles: number, seed: number): MeshData {
  const tris = estimateTriangles(boxes, maxTiles);
  const positions = new Float32Array(tris * 9), normals = new Float32Array(tris * 9), colors = new Float32Array(tris * 9);
  let o = 0;
  for (const b of boxes) {
    const faces = { ...DEFAULT_FACES, ...b.faces };
    const bs = boxSeed(b.pos, b.size, seed);
    const baseY = b.pos[1] - b.size[1] / 2;
    ALL_FACES.forEach((_, fi) => {
      const f = faceDefs(b.pos, b.size)[fi];
      if (!faces[f.key]) return;
      const nu = tileCount(f.uLen, b.tile, maxTiles), nv = tileCount(f.vLen, b.tile, maxTiles);
      const du = f.uLen / nu, dv = f.vLen / nv;
      const side = f.key !== 'py' && f.key !== 'ny';
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const base = tileColor(look, b.palette, bs, fi, i, j, f.top, b.mossScale ?? 1);
          const corner = (a: number, c: number): { p: V3; col: V3 } => {
            const p: V3 = [f.origin[0] + f.u[0] * a * du + f.v[0] * c * dv, f.origin[1] + f.u[1] * a * du + f.v[1] * c * dv, f.origin[2] + f.u[2] * a * du + f.v[2] * c * dv];
            const k = side ? sideShade(p[1] - baseY, look) : 1;
            return { p, col: [base[0] * k, base[1] * k, base[2] * k] };
          };
          const c00 = corner(i, j), c10 = corner(i + 1, j), c11 = corner(i + 1, j + 1), c01 = corner(i, j + 1);
          for (const t of [[c00, c10, c11], [c00, c11, c01]]) {
            for (const v of t) {
              positions[o] = v.p[0]; positions[o + 1] = v.p[1]; positions[o + 2] = v.p[2];
              normals[o] = f.n[0]; normals[o + 1] = f.n[1]; normals[o + 2] = f.n[2];
              colors[o] = v.col[0]; colors[o + 1] = v.col[1]; colors[o + 2] = v.col[2];
              o += 3;
            }
          }
        }
      }
    });
  }
  return { positions, normals, colors };
}
