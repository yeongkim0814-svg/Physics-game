// 하이트필드 격자 → 메시. 같은 높이의 칸은 그리디로 큰 사각형으로 합치고(윗면), 높이 차가 나는 칸 경계마다 수직 절벽 벽을 만든다
// (높은 쪽 칸이 낮은 쪽을 향해 벽을 그린다 → 근거리/원거리 LOD 경계도 같은 규칙으로 균열 없이 이어진다). 보이지 않는 아래면은 만들지 않는다.
// 렌더 메시는 사각형을 타일로 쪼개 정점색 모자이크(blockTerrain 의 tileColor·sideShade 재사용), 충돌 메시는 합친 사각형 그대로(삼각형 최소).
// 순수 계산 (THREE/Rapier 의존 없음).
import { hash3, sideShade, tileColor, tileCount, type MeshData, type PaletteKey, type TerrainLook, type V3 } from '../blockTerrain';
import { TerrainField, type HeightGrid } from './terrainField';

/** 윗면 사각형: [x0,x1]×[z0,z1], 높이 level(fineStep 단위) */
export interface TopQuad { x0: number; z0: number; x1: number; z1: number; level: number; far: boolean }
/**
 * 수직 벽: axis 'x' = 평면 z=fixed 위에서 x∈[a,b] 로 뻗음, 'z' = 평면 x=fixed 위에서 z∈[a,b]. (nx,nz) = 바깥(낮은 쪽) 방향 법선.
 * 높이 yLow~yHigh 는 fineStep 단위 정수.
 */
export interface WallQuad { axis: 'x' | 'z'; fixed: number; a: number; b: number; yLow: number; yHigh: number; nx: number; nz: number; far: boolean }

export interface Quads { tops: TopQuad[]; walls: WallQuad[] }

const EPS = 0.01;

/** 격자 하나의 윗면(그리디 합치기) + 벽을 모은다. win = 이 반폭(m) 안쪽 칸만 포함 */
function gridQuads(field: TerrainField, g: HeightGrid, far: boolean, win: number, out: Quads) {
  const { n, cell, half, levels } = g;
  const nearCell = field.P.lod.nearCell;
  const inWin = (ix: number, iz: number) => {
    const cx = -half + (ix + 0.5) * cell, cz = -half + (iz + 0.5) * cell;
    return Math.abs(cx) < win && Math.abs(cz) < win;
  };
  const valid = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < n && iz < n && levels[iz * n + ix] !== -32768 && inWin(ix, iz);

  // 윗면: 행 우선 그리디 사각형
  const seen = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      if (seen[iz * n + ix] || !valid(ix, iz)) continue;
      const lv = levels[iz * n + ix];
      let w = 1;
      while (ix + w < n && !seen[iz * n + ix + w] && valid(ix + w, iz) && levels[iz * n + ix + w] === lv) w++;
      let h = 1;
      grow: while (iz + h < n) {
        for (let k = 0; k < w; k++) {
          if (seen[(iz + h) * n + ix + k] || !valid(ix + k, iz + h) || levels[(iz + h) * n + ix + k] !== lv) break grow;
        }
        h++;
      }
      for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) seen[(iz + dz) * n + ix + dx] = 1;
      out.tops.push({ x0: -half + ix * cell, z0: -half + iz * cell, x1: -half + (ix + w) * cell, z1: -half + (iz + h) * cell, level: lv, far });
    }
  }

  // 벽: 칸마다 4방향. 이웃(낮은 LOD 쪽이면 한 칸 안에서 여러 번 표본)이 더 낮으면 그 높이 차만큼 벽
  const raw: WallQuad[] = [];
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      if (!valid(ix, iz)) continue;
      const lv = levels[iz * n + ix];
      const cx = -half + (ix + 0.5) * cell, cz = -half + (iz + 0.5) * cell;
      for (const [nx, nz] of dirs) {
        const ex = cx + nx * (cell / 2), ez = cz + nz * (cell / 2);
        // 이웃이 더 고해상도(근거리)면 칸 변을 nearCell 단위로 쪼개 본다
        const fine = far && TerrainField.cellLevel(field.near, ex + nx * EPS, ez + nz * EPS) !== null;
        const m = fine ? Math.round(cell / nearCell) : 1, sub = cell / m;
        for (let k = 0; k < m; k++) {
          const along = (k + 0.5) * sub - cell / 2;
          const px = nx !== 0 ? ex + nx * EPS : cx + along, pz = nz !== 0 ? ez + nz * EPS : cz + along;
          const ln = field.levelAt(px, pz);
          if (ln === null || ln >= lv) continue;
          const a = (nx !== 0 ? cz : cx) + along - sub / 2;
          raw.push({ axis: nx !== 0 ? 'z' : 'x', fixed: nx !== 0 ? ex : ez, a, b: a + sub, yLow: ln, yHigh: lv, nx, nz, far });
        }
      }
    }
  }
  // 같은 평면·같은 높이 구간의 이어진 조각을 하나로
  const groups = new Map<string, WallQuad[]>();
  for (const w of raw) {
    const key = `${w.axis}|${w.fixed}|${w.nx}${w.nz}|${w.yLow}|${w.yHigh}`;
    const list = groups.get(key);
    if (list) list.push(w); else groups.set(key, [w]);
  }
  for (const list of groups.values()) {
    list.sort((p, q) => p.a - q.a);
    let cur = { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i].a - cur.b) < 1e-6) cur.b = list[i].b;
      else { out.walls.push(cur); cur = { ...list[i] }; }
    }
    out.walls.push(cur);
  }
}

/** 지형 사각형 수집. includeFar=false 면 근거리 격자만 (충돌용) */
export function collectQuads(field: TerrainField, win: number, includeFar: boolean): Quads {
  const out: Quads = { tops: [], walls: [] };
  gridQuads(field, field.near, false, win, out);
  if (includeFar) gridQuads(field, field.far, true, win, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// 렌더 메시
// ---------------------------------------------------------------------------------------------

export interface TerrainTint { depth: { color: number; amount: number; depth: number; darken: number }; /** 절벽 벽면 명도 배율 */ wall: number; far: { color: number; from: number; to: number; amount: number } }
export interface TerrainMeshOpts {
  seed: number;
  /** 타일 한 변(m): 원점 반경 r0 이내는 top/wall, 그 바깥은 (r/r0)^grow 배로 커져 max 에서 멈춘다 (먼 곳일수록 삼각형 절감) */
  tile: { top: number; wall: number; max: number; r0: number; grow: number };
  maxTiles: number;
  topPalette: readonly { minY: number; palette: PaletteKey }[];
}

const unpack = (hex: number): V3 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mixv = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 높이·반경에 따른 색 보정: 깊을수록 어둡고 보랏빛, 멀수록 원경색으로 수렴 */
export function tintColor(c: V3, y: number, radius: number, T: TerrainTint): V3 {
  const k = Math.min(1, Math.max(0, -y / T.depth.depth));
  let o = mixv(c, unpack(T.depth.color), T.depth.amount * k);
  const dk = 1 - T.depth.darken * k;
  o = [o[0] * dk, o[1] * dk, o[2] * dk];
  const f = sstep(T.far.from, T.far.to, radius) * T.far.amount;
  return f > 0 ? mixv(o, unpack(T.far.color), f) : o;
}

/** 반경 r 에서의 타일 크기 */
export function tileSizeAt(base: number, r: number, T: TerrainMeshOpts['tile']): number {
  return Math.min(T.max, base * Math.max(1, Math.pow(r / T.r0, T.grow)));
}

export function topPaletteAt(y: number, list: TerrainMeshOpts['topPalette']): PaletteKey {
  for (const p of list) if (y >= p.minY) return p.palette;
  return list[list.length - 1].palette;
}

/** 근거리·원거리 모든 사각형을 정점색 모자이크 비색인 삼각형 메시로 (렌더용) */
export function buildTerrainMesh(field: TerrainField, look: TerrainLook, tint: TerrainTint, o: TerrainMeshOpts): MeshData {
  const q = collectQuads(field, Infinity, true);
  const fs = field.P.fineStep;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const pushTri = (p: V3[], n: V3, c: V3[]) => {
    for (let i = 0; i < 3; i++) { pos.push(p[i][0], p[i][1], p[i][2]); nor.push(n[0], n[1], n[2]); col.push(c[i][0], c[i][1], c[i][2]); }
  };
  /** origin 에서 u(길이 uLen)·v(길이 vLen) 로 뻗은 사각형을 nu×nv 타일로. 타일마다 색 하나 (colorAt), 정점 보정은 vertexMul */
  const emit = (origin: V3, u: V3, v: V3, uLen: number, vLen: number, nu: number, nv: number, n: V3,
    colorAt: (i: number, j: number) => V3, vertexMul: (p: V3) => number) => {
    const du = uLen / nu, dv = vLen / nv;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const base = colorAt(i, j);
        const corner = (a: number, b: number) => {
          const p: V3 = [origin[0] + u[0] * a * du + v[0] * b * dv, origin[1] + u[1] * a * du + v[1] * b * dv, origin[2] + u[2] * a * du + v[2] * b * dv];
          const k = vertexMul(p);
          return { p, c: [base[0] * k, base[1] * k, base[2] * k] as V3 };
        };
        const c00 = corner(i, j), c10 = corner(i + 1, j), c11 = corner(i + 1, j + 1), c01 = corner(i, j + 1);
        pushTri([c00.p, c10.p, c11.p], n, [c00.c, c10.c, c11.c]);
        pushTri([c00.p, c11.p, c01.p], n, [c00.c, c11.c, c01.c]);
      }
    }
  };
  const seedOf = (a: number, b: number, c: number) => Math.floor(hash3(Math.round(a * 4), Math.round(b), Math.round(c * 4), o.seed) * 2147483647);

  for (const t of q.tops) {
    const y = t.level * fs, w = t.x1 - t.x0, d = t.z1 - t.z0;
    const palette = topPaletteAt(y, o.topPalette);
    const rad = Math.hypot((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2);
    const tile = tileSizeAt(o.tile.top, rad, o.tile);
    const bs = seedOf(t.x0, t.level, t.z0);
    const moss = palette === 'earth' ? 0.5 : 0.15;
    emit([t.x0, y, t.z1], [1, 0, 0], [0, 0, -1], w, d, tileCount(w, tile, o.maxTiles), tileCount(d, tile, o.maxTiles), [0, 1, 0],
      (i, j) => tintColor(tileColor(look, palette, bs, 0, i, j, true, moss), y, rad, tint), () => 1);
  }
  for (const wl of q.walls) {
    const y0 = wl.yLow * fs, y1 = wl.yHigh * fs, len = wl.b - wl.a, hgt = y1 - y0;
    const bs = seedOf(wl.axis === 'x' ? wl.a : wl.fixed, wl.yLow * 7 + wl.yHigh, wl.axis === 'x' ? wl.fixed : wl.a);
    let origin: V3, u: V3;
    if (wl.axis === 'x') { // 평면 z = fixed
      if (wl.nz > 0) { origin = [wl.a, y0, wl.fixed]; u = [1, 0, 0]; } else { origin = [wl.b, y0, wl.fixed]; u = [-1, 0, 0]; }
    } else if (wl.nx > 0) { origin = [wl.fixed, y0, wl.b]; u = [0, 0, -1]; } else { origin = [wl.fixed, y0, wl.a]; u = [0, 0, 1]; }
    const cxm = wl.axis === 'x' ? (wl.a + wl.b) / 2 : wl.fixed, czm = wl.axis === 'x' ? wl.fixed : (wl.a + wl.b) / 2;
    const rad = Math.hypot(cxm, czm);
    const tile = tileSizeAt(o.tile.wall, rad, o.tile);
    emit(origin, u, [0, 1, 0], len, hgt, tileCount(len, tile, o.maxTiles), tileCount(hgt, tile, o.maxTiles), [wl.nx, 0, wl.nz],
      (i, j) => { const c = tintColor(tileColor(look, 'cliff', bs, 2, i, j, false, 1), (y0 + y1) / 2, rad, tint); return [c[0] * tint.wall, c[1] * tint.wall, c[2] * tint.wall] as V3; },
      (p) => sideShade(p[1] - y0, look));
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col) };
}

// ---------------------------------------------------------------------------------------------
// 충돌 메시 (근거리 영역만, 합친 사각형 그대로)
// ---------------------------------------------------------------------------------------------

export interface CollisionMesh { vertices: Float32Array; indices: Uint32Array }

export function buildCollisionMesh(field: TerrainField, half: number): CollisionMesh {
  const q = collectQuads(field, half, false);
  const fs = field.P.fineStep;
  const v: number[] = [], idx: number[] = [];
  const quad = (p0: V3, p1: V3, p2: V3, p3: V3) => {
    const b = v.length / 3;
    v.push(...p0, ...p1, ...p2, ...p3);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const t of q.tops) {
    const y = t.level * fs;
    quad([t.x0, y, t.z1], [t.x1, y, t.z1], [t.x1, y, t.z0], [t.x0, y, t.z0]);
  }
  for (const w of q.walls) {
    const y0 = w.yLow * fs, y1 = w.yHigh * fs;
    if (w.axis === 'x') {
      if (w.nz > 0) quad([w.a, y0, w.fixed], [w.b, y0, w.fixed], [w.b, y1, w.fixed], [w.a, y1, w.fixed]);
      else quad([w.b, y0, w.fixed], [w.a, y0, w.fixed], [w.a, y1, w.fixed], [w.b, y1, w.fixed]);
    } else if (w.nx > 0) quad([w.fixed, y0, w.b], [w.fixed, y0, w.a], [w.fixed, y1, w.a], [w.fixed, y1, w.b]);
    else quad([w.fixed, y0, w.a], [w.fixed, y0, w.b], [w.fixed, y1, w.b], [w.fixed, y1, w.a]);
  }
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}
