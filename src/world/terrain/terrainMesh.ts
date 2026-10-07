// 하이트필드 격자 → 메시. 같은 높이의 칸은 그리디로 큰 사각형으로 합치고(윗면), 높이 차가 나는 칸 경계마다 수직 절벽 벽을 만든다
// (높은 쪽 칸이 낮은 쪽을 향해 벽을 그린다 → 근거리/원거리 LOD 경계도 같은 규칙으로 균열 없이 이어진다). 보이지 않는 아래면은 만들지 않는다.
// 렌더 메시는 사각형을 격자로 쪼개 불규칙한 삼각형 패싯으로(world/facet.ts: 안쪽 정점 흔들림·절벽은 안쪽으로 패임·걸을 수 없는 윗면은 기복,
// 색은 삼각형마다 blockTerrain 의 tileColor·sideShade 재사용), 충돌 메시는 합친 사각형 그대로(삼각형 최소, 걸을 수 있는 윗면은 렌더도 평평).
// 순수 계산 (THREE/Rapier 의존 없음).
import { hash3, sideShade, tileColor, type MeshData, type PaletteKey, type TerrainLook, type V3 } from '../blockTerrain';
import { emitFacets, FACET_DEFAULT, splitCount, type FacetLook } from '../facet';
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

  // 윗면: 행 우선 그리디 사각형. 굴곡 칸(근거리 격자)은 평평한 사각형이 아니라 삼각형 격자로 따로 만든다
  const topOk = (ix: number, iz: number) => valid(ix, iz) && (far || !field.reliefCell[iz * n + ix]);
  const seen = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      if (seen[iz * n + ix] || !topOk(ix, iz)) continue;
      const lv = levels[iz * n + ix];
      let w = 1;
      while (ix + w < n && !seen[iz * n + ix + w] && topOk(ix + w, iz) && levels[iz * n + ix + w] === lv) w++;
      let h = 1;
      grow: while (iz + h < n) {
        for (let k = 0; k < w; k++) {
          if (seen[(iz + h) * n + ix + k] || !topOk(ix + k, iz + h) || levels[(iz + h) * n + ix + k] !== lv) break grow;
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
// 굴곡 칸 삼각형 (렌더·충돌 공용: 같은 정점 높이 = field.reliefAt, 같은 대각선)
// ---------------------------------------------------------------------------------------------

/** 근거리 격자의 굴곡 칸(중심이 win 안쪽)마다 삼각형 2개를 낸다. 대각선은 칸 해시로 번갈아 뒤집는다 */
export function forEachReliefTriangle(field: TerrainField, win: number, cb: (a: V3, b: V3, c: V3, ix: number, iz: number) => void) {
  const g = field.near, n = g.n, c = g.cell;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      if (!field.reliefCell[iz * n + ix]) continue;
      const x0 = -g.half + ix * c, z0 = -g.half + iz * c, x1 = x0 + c, z1 = z0 + c;
      if (Math.abs(x0 + c / 2) >= win || Math.abs(z0 + c / 2) >= win) continue;
      const P = (x: number, z: number): V3 => [x, field.reliefAt(x, z), z];
      const a = P(x0, z0), b = P(x1, z0), d = P(x1, z1), e = P(x0, z1);
      if (hash3(ix, iz, 7, 61) > 0.5) { cb(a, b, e, ix, iz); cb(b, d, e, ix, iz); } else { cb(a, b, d, ix, iz); cb(a, d, e, ix, iz); }
    }
  }
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
  /** 삼각 분할 외형 (없으면 FACET_DEFAULT) */
  facet?: FacetLook;
  /** 이 반폭(m) 안쪽 윗면은 충돌과 같게 평평하게 둔다 (기본 0 = 모두 기복 허용) */
  walkHalf?: number;
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

/** 근거리·원거리 모든 사각형을 정점색 삼각형 패싯 비색인 메시로 (렌더용) */
export function buildTerrainMesh(field: TerrainField, look: TerrainLook, tint: TerrainTint, o: TerrainMeshOpts): MeshData {
  // 이음새(seam) 안쪽만 계단형 사각 지형 — 바깥은 연속 삼각 격자(OuterLattice)가 맡는다
  const q = collectQuads(field, field.P.outer.seam, false);
  const fs = field.P.fineStep;
  const F = o.facet ?? FACET_DEFAULT, walkHalf = o.walkHalf ?? 0;
  const out = { pos: [] as number[], nor: [] as number[], col: [] as number[] };
  const seedOf = (a: number, b: number, c: number) => Math.floor(hash3(Math.round(a * 4), Math.round(b), Math.round(c * 4), o.seed) * 2147483647);
  /** 색 변화를 줄여 면의 명암 차이가 무작위 색이 아니라 경사(조명)에서 나오게 한다: 기준색 쪽으로 (1-colorVar) 만큼 당긴다 */
  const calm = (c: V3, ref: V3): V3 => mixv(ref, c, F.colorVar);
  /** 팔레트별 공통 기준색: 평평한 윗면·굴곡 삼각형·절벽이 같은 기준으로 당겨져 이웃끼리 색이 튀지 않는다 */
  const refCache = new Map<string, V3>();
  const refOf = (palette: PaletteKey, top: boolean): V3 => {
    const k = palette + (top ? 't' : 's');
    let r = refCache.get(k);
    if (!r) { r = tileColor(look, palette, o.seed, 0, 0, 0, top, 0); refCache.set(k, r); }
    return r;
  };

  for (const t of q.tops) {
    const y = t.level * fs, w = t.x1 - t.x0, d = t.z1 - t.z0;
    const palette = topPaletteAt(y, o.topPalette);
    const rad = Math.hypot((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2);
    const tile = tileSizeAt(o.tile.top, rad, o.tile);
    const bs = seedOf(t.x0, t.level, t.z0);
    const moss = palette === 'earth' ? 0.5 : 0.15;
    const ms = rad <= F.range ? F.minSplitTop : Infinity;
    const nu = splitCount(w, tile, o.maxTiles, ms), nv = splitCount(d, tile, o.maxTiles, ms);
    const lift = Math.min(F.topLiftMax, F.topLift * Math.min(w / nu, d / nv));
    emitFacets({
      origin: [t.x0, y, t.z1], u: [1, 0, 0], v: [0, 0, -1], uLen: w, vLen: d, nu, nv, n: [0, 1, 0], seed: bs,
      colorAt: (i, j) => tintColor(calm(tileColor(look, palette, bs, 0, i >> 2, j >> 1, true, moss), refOf(palette, true)), y, rad, tint),
      jitter: F.jitter, triShade: F.triShade,
      // 걸을 수 있는 영역(외곽 벽 안쪽)은 충돌과 같게 평평, 바깥은 상하 기복으로 능선·언덕 패싯
      bump: { mode: 'both', amp: (p0) => (Math.max(Math.abs(p0[0]), Math.abs(p0[2])) > walkHalf ? lift : 0) },
    }, out);
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
    const ms = rad <= F.range ? F.minSplit : Infinity;
    // 고원 바깥(충돌 없음) 절벽은 아래로 갈수록 바깥으로 기울고(talus), 바닥 아래로 묻어 균열을 막는다. 걸을 수 있는 영역 안쪽은 수직 그대로
    const leaning = Math.max(Math.abs(cxm), Math.abs(czm)) > walkHalf && F.lean > 0;
    const sink = leaning ? Math.min(1.2, hgt * F.skirt) : 0;
    const oy: V3 = [origin[0], origin[1] - sink, origin[2]];
    const vH = hgt + sink;
    const nu = splitCount(len, tile, o.maxTiles, ms), nv = splitCount(vH, tile, o.maxTiles, ms);
    const cell = Math.min(len / nu, vH / nv);
    emitFacets({
      origin: oy, u, v: [0, 1, 0], uLen: len, vLen: vH, nu, nv, n: [wl.nx, 0, wl.nz], seed: bs,
      lean: leaning ? { top: y1, k: F.lean, max: F.leanMax } : undefined,
      colorAt: (i, j) => { const c = tintColor(calm(tileColor(look, 'cliff', bs, 2, i >> 1, j >> 1, false, 1), refOf('cliff', false)), (y0 + y1) / 2, rad, tint); return [c[0] * tint.wall, c[1] * tint.wall, c[2] * tint.wall] as V3; },
      vertexMul: (p) => sideShade(p[1] - y0, look),
      jitter: F.jitter, triShade: F.triShade,
      // 절벽면은 안쪽(낮은 쪽의 반대)으로만 패인다: 충돌 벽(수직)보다 바깥으로 나오지 않아 걷는 공간을 침범하지 않는다
      bump: { mode: 'in', amp: () => cell * F.sideIn },
    }, out);
  }
  // 굴곡 칸: 걸을 수 있는 고원의 삼각형 격자 (충돌과 같은 삼각형). 색은 earth 팔레트의 완만한 변화, 명암은 경사가 만든다
  const earthRef = refOf('earth', true);
  forEachReliefTriangle(field, Infinity, (a, b, c, ix, iz) => {
    const base = calm(tileColor(look, 'earth', o.seed, 0, ix >> 2, iz >> 2, true, 0.5), earthRef);
    const shade = 1 + (hash3(ix, iz, 9, o.seed) - 0.5) * 2 * F.triShade;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const flip = ny < 0, len = Math.hypot(nx, ny, nz) || 1, s = flip ? -1 : 1;
    for (const p of flip ? [a, c, b] : [a, b, c]) {
      out.pos.push(p[0], p[1], p[2]); out.nor.push((s * nx) / len, (s * ny) / len, (s * nz) / len);
      const t = tintColor(base, p[1], Math.hypot(p[0], p[2]), tint);
      out.col.push(t[0] * shade, t[1] * shade, t[2] * shade);
    }
  });
  // 이음새 바깥 가장자리 근처 계단형 정점에도 같은 위치 변위를 더한다 (이음새 안쪽에서는 거의 0). 법선 재계산
  for (let i = 0; i < out.pos.length; i += 3) out.pos[i + 1] += field.outsideShift(out.pos[i], out.pos[i + 2]);
  for (let t = 0; t < out.pos.length; t += 9) {
    const ax = out.pos[t], ay = out.pos[t + 1], az = out.pos[t + 2];
    const ux = out.pos[t + 3] - ax, uy = out.pos[t + 4] - ay, uz = out.pos[t + 5] - az, vx = out.pos[t + 6] - ax, vy = out.pos[t + 7] - ay, vz = out.pos[t + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    const sgn = nx * out.nor[t] + ny * out.nor[t + 1] + nz * out.nor[t + 2] < 0 ? -1 : 1; // 원래 바깥 방향 유지
    for (let k = 0; k < 3; k++) { out.nor[t + k * 3] = nx * sgn; out.nor[t + k * 3 + 1] = ny * sgn; out.nor[t + k * 3 + 2] = nz * sgn; }
  }
  emitOuter(field, look, tint, o, F, out, calm, refOf);
  return { positions: new Float32Array(out.pos), normals: new Float32Array(out.nor), colors: new Float32Array(out.col) };
}

/**
 * 고원 바깥 연속 삼각 격자를 메시에 추가한다. 색은 경사(법선 y)로 정한다: 완만하면 윗면 팔레트(높이별), 가파르면 절벽 팔레트 — 명암은 조명이 만든다.
 * 이음새에는 안쪽 계단형 지형과의 틈을 덮는 가림막(안쪽을 향한 절벽색 판)을 둔다.
 */
function emitOuter(field: TerrainField, look: TerrainLook, tint: TerrainTint, o: TerrainMeshOpts, F: FacetLook,
  out: { pos: number[]; nor: number[]; col: number[] }, calm: (c: V3, ref: V3) => V3, refOf: (p: PaletteKey, top: boolean) => V3) {
  field.outer.forEachTriangle((a, b, c, ix, iz, ring) => {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const flip = ny < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    const yAvg = (a[1] + b[1] + c[1]) / 3, rad = Math.hypot((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3);
    const cs = ring === 0 ? 1 : 3; // 변화 칸 크기: 거친 격자는 더 크게
    const palette = topPaletteAt(yAvg, o.topPalette);
    const top = calm(tileColor(look, palette, o.seed, 0, ix >> cs, iz >> cs, true, 0.15), refOf(palette, true));
    const cliff = calm(tileColor(look, 'cliff', o.seed, 2, ix >> cs, iz >> cs, false, 1), refOf('cliff', false));
    const t = sstep(0.55, 0.86, ny);
    const base = mixv([cliff[0] * tint.wall, cliff[1] * tint.wall, cliff[2] * tint.wall], top, t);
    const col = tintColor(base, yAvg, rad, tint);
    const shade = 1 + (hash3(ix, iz, ring + 11, o.seed) - 0.5) * 2 * F.triShade;
    for (const p of flip ? [a, c, b] : [a, b, c]) {
      out.pos.push(p[0], p[1], p[2]); out.nor.push(nx, ny, nz); out.col.push(col[0] * shade, col[1] * shade, col[2] * shade);
    }
  });
  // 이음새 가림막: 윗변 = 격자 이음새 변, 아래 = 깊은 곳. 안쪽(+고원 쪽)을 향한다. 안쪽 지형 벽과 겹치지 않게 0.05m 바깥에 둔다
  const DEEP = -90, cliffC = tintColor(calm(tileColor(look, 'cliff', o.seed, 2, 0, 0, false, 1), refOf('cliff', false)), -30, 0, tint);
  field.outer.forEachSeamSegment((p0, p1, nx, nz) => {
    const off = (p: V3): V3 => [p[0] - nx * 0.05, p[1], p[2] - nz * 0.05];
    const a = off(p0), b = off(p1), c: V3 = [b[0], DEEP, b[2]], d: V3 = [a[0], DEEP, a[2]];
    for (const tri of [[a, b, c], [a, c, d]] as V3[][]) {
      const ux = tri[1][0] - tri[0][0], uy = tri[1][1] - tri[0][1], uz = tri[1][2] - tri[0][2], vx = tri[2][0] - tri[0][0], vy = tri[2][1] - tri[0][1], vz = tri[2][2] - tri[0][2];
      const cx = uy * vz - uz * vy, cz = ux * vy - uy * vx;
      const ordered = cx * nx + cz * nz >= 0 ? tri : [tri[0], tri[2], tri[1]];
      for (const p of ordered) { out.pos.push(p[0], p[1], p[2]); out.nor.push(nx, 0, nz); out.col.push(cliffC[0], cliffC[1], cliffC[2]); }
    }
  });
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
  // 굴곡 칸: 렌더와 같은 삼각형 (충돌 윗면). 감김 순서는 위쪽(+y) 법선
  forEachReliefTriangle(field, half, (a, b, c) => {
    const b0 = v.length / 3;
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    v.push(...a, ...b, ...c);
    if (ny >= 0) idx.push(b0, b0 + 1, b0 + 2); else idx.push(b0, b0 + 2, b0 + 1);
  });
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}
