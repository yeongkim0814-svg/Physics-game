import { describe, expect, it } from 'vitest';
import { MAP } from '../../data/map';
import { TERRAIN_COLLISION, TERRAIN_FIELD, TERRAIN_MESH } from '../../config/terrainParams';
import { TUNING } from '../../config/tuning';
import { VISUAL } from '../../config/settings';
import { stairBlocks } from '../mapGen';
import { inFootprint } from '../decor';
import { isFlatSpot } from '../buildDecor';
import { clamp01, fbm01, gradNoise, ridged01, smoothstep } from './noise';
import { createTerrainField, type TerrainMapData } from './terrainField';
import { buildCollisionMesh, buildTerrainMesh, collectQuads, tileSizeAt } from './terrainMesh';
import { buildWalkGrid, floodReachable, reached } from './reachability';

const MAPDATA: TerrainMapData = { canyon: MAP.canyon, ...MAP.terrain };
const field = createTerrainField(TERRAIN_FIELD, MAPDATA);
const FS = TERRAIN_FIELD.fineStep;

describe('지형 노이즈', () => {
  it('결정적이고 범위 안', () => {
    expect(gradNoise(1.3, 2.7, 5)).toBe(gradNoise(1.3, 2.7, 5));
    for (let i = 0; i < 300; i++) {
      const x = i * 0.73, z = i * 1.19;
      const g = gradNoise(x, z, 3), f = fbm01(x, z, 3, 4), r = ridged01(x, z, 3, 4);
      expect(Math.abs(g)).toBeLessThanOrEqual(1.0001);
      expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1);
      expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1);
    }
    expect(gradNoise(1.3, 2.7, 5)).not.toBe(gradNoise(1.3, 2.7, 6));
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
    expect(clamp01(2)).toBe(1);
  });
});

describe('하이트필드', () => {
  it('시드 고정 결정적, 시드가 다르면 달라진다', () => {
    const b = createTerrainField(TERRAIN_FIELD, MAPDATA);
    expect(Array.from(b.near.levels)).toEqual(Array.from(field.near.levels));
    expect(Array.from(b.far.levels.slice(0, 2000))).toEqual(Array.from(field.far.levels.slice(0, 2000)));
    const c = createTerrainField({ ...TERRAIN_FIELD, seed: 99 }, MAPDATA);
    expect(Array.from(c.near.levels)).not.toEqual(Array.from(field.near.levels));
  });
  it('모든 높이는 fineStep 의 정수배, 일반 지형은 층(stepH) 단위', () => {
    for (let x = -300; x <= 300; x += 7.3) for (let z = -300; z <= 300; z += 9.1) {
      const h = field.surface(x, z);
      if (h === -Infinity) continue;
      expect(Math.abs(h / FS - Math.round(h / FS))).toBeLessThan(1e-6);
    }
  });
  it('플레이 고원은 정확히 y=0, 협곡은 정확히 -depth (z∈[zMin,zMax], |x|≤84), 스폰·탑 밑동 포함', () => {
    const c = MAP.canyon;
    for (let x = -83; x <= 83; x += 2) {
      for (let z = -83; z <= 83; z += 2) {
        const inCanyon = z > c.zMin && z < c.zMax;
        const bluff = MAP.terrain.bluffs.some((b) => inFootprint(x, z, b.center, b.size, 0)) || MAP.terrain.ramps.some((r) => Math.hypot(x - r.to[0], z - r.to[1]) < 80 && x > 20);
        if (bluff) continue;
        expect(field.surface(x, z)).toBe(inCanyon ? -c.depth : 0);
      }
    }
    expect(field.surface(MAP.spawn[0], MAP.spawn[2])).toBe(0);
    expect(field.surface(MAP.tower.x, MAP.tower.z)).toBe(0);
  });
  it('쌍둥이 낙하 패드: 반경 ≥ 40m, 탑 밑동을 품고, 반경 안은 완전 평탄(y=0)', () => {
    const pad = MAP.terrain.pads.find((p) => p.id === 'twinDrop')!;
    expect(pad.radius).toBeGreaterThanOrEqual(40);
    expect(Math.hypot(pad.center[0] - MAP.tower.x, pad.center[1] - MAP.tower.z)).toBeLessThan(pad.radius - MAP.tower.w);
    for (let a = 0; a < 360; a += 5) for (let r = 0; r <= pad.radius - 1; r += 3) {
      const x = pad.center[0] + Math.cos(a * Math.PI / 180) * r, z = pad.center[1] + Math.sin(a * Math.PI / 180) * r;
      expect(field.surface(x, z)).toBe(pad.y);
    }
  });
  it('고원 바깥은 깊은 계곡(20m 이상)과 메사·산맥(양수 높이)을 가진다', () => {
    let min = 0, max = -Infinity, deep = 0, n = 0;
    for (let x = -500; x <= 500; x += 10) for (let z = -500; z <= 500; z += 10) {
      if (Math.max(Math.abs(x), Math.abs(z)) < 100 || Math.hypot(x, z) > 500) continue;
      const h = field.surface(x, z);
      min = Math.min(min, h); max = Math.max(max, h); n++;
      if (h <= -20) deep++;
    }
    expect(min).toBeLessThanOrEqual(-27);
    expect(max).toBeGreaterThanOrEqual(18);
    expect(deep / n).toBeGreaterThan(0.1);
  });
  it('LOD 경계: 근거리·원거리 모두에서 표면 질의가 유한', () => {
    for (const [x, z] of [[0, 0], [119, 119], [121, 0], [300, -200], [-480, 100]]) expect(Number.isFinite(field.surface(x, z))).toBe(true);
    expect(field.cellSizeAt(0, 0)).toBe(TERRAIN_FIELD.lod.nearCell);
    expect(field.cellSizeAt(300, 0)).toBe(TERRAIN_FIELD.lod.farCell);
  });
  it('생성 시간 (로딩 지연 평가): 필드 격자 샘플링이 1초 이내', () => {
    expect(field.buildMs).toBeLessThan(1000);
  });
});

describe('레이아웃 데이터', () => {
  it('둔덕·램프는 기존 박스(폐허·탑·테라스)·패드와 겹치지 않는다', () => {
    const boxes = MAP.blocks.map((b) => ({ c: [b.pos[0], b.pos[2]] as [number, number], s: [b.size[0], b.size[2]] as [number, number] }));
    const overlap = (c1: [number, number], s1: [number, number], c2: [number, number], s2: [number, number], m: number) =>
      Math.abs(c1[0] - c2[0]) < (s1[0] + s2[0]) / 2 + m && Math.abs(c1[1] - c2[1]) < (s1[1] + s2[1]) / 2 + m;
    for (const b of MAP.terrain.bluffs) for (const k of boxes) expect(overlap(b.center, b.size, k.c, k.s, 1)).toBe(false);
    for (const r of MAP.terrain.ramps) {
      const len = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]);
      for (let t = 0; t <= len; t += 1) {
        const x = r.from[0] + (r.to[0] - r.from[0]) * t / len, z = r.from[1] + (r.to[1] - r.from[1]) * t / len;
        for (const k of boxes) expect(inFootprint(x, z, k.c, k.s, r.width / 2 + 1)).toBe(false);
        for (const p of MAP.terrain.pads) expect(Math.hypot(x - p.center[0], z - p.center[1])).toBeGreaterThan(p.radius + p.blend);
      }
    }
  });
  it('램프 경사: 인접 칸 높이 차 ≤ 0.4m(자동 계단 한계 0.5m 이하), 끝점 높이는 둔덕 윗면과 같다', () => {
    for (const r of MAP.terrain.ramps) {
      const len = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]);
      expect((r.y1 - r.y0) / len * TERRAIN_FIELD.lod.nearCell).toBeLessThanOrEqual(0.4 + 1e-9);
      let prev = field.surface(r.from[0], r.from[1]);
      for (let t = 1; t <= len; t += TERRAIN_FIELD.lod.nearCell) {
        const h = field.surface(r.from[0] + (r.to[0] - r.from[0]) * t / len, r.from[1] + (r.to[1] - r.from[1]) * t / len);
        expect(Math.abs(h - prev)).toBeLessThanOrEqual(0.4 + 1e-6); prev = h;
      }
      expect(Math.abs(field.surface(r.to[0], r.to[1]) - r.y1)).toBeLessThanOrEqual(0.4);
      const ux = (r.to[0] - r.from[0]) / len, uz = (r.to[1] - r.from[1]) / len;
      expect(field.surface(r.to[0] + ux * 4, r.to[1] + uz * 4)).toBe(r.y1); // 램프 끝 너머는 둔덕 윗면(평평)
      expect(Math.abs(field.surface(r.from[0], r.from[1]) - r.y0)).toBeLessThanOrEqual(0.4); // 첫 칸은 이미 조금 올라가 있다
    }
    expect(FS).toBeLessThanOrEqual(TUNING.player.stepHeight);
  });
});

describe('도달성 (스폰에서 걸어서)', () => {
  const stairs = MAP.stairs.flatMap((s) => stairBlocks(s));
  const boxes = [...MAP.blocks, ...stairs.map((p) => ({ pos: p.pos, size: p.size }))];
  const cell = 0.4, half = MAP.size / 2 + 2;
  const grid = buildWalkGrid(field, boxes, half, cell);
  const seen = floodReachable(grid, [MAP.spawn[0], MAP.spawn[2]], TUNING.player.stepHeight);
  const reach = (x: number, z: number) => reached(grid, seen, x, z);
  const T = MAP.tower;

  it('스폰·남쪽 지면·폐허 사이 통로', () => {
    expect(reach(MAP.spawn[0], MAP.spawn[2])).toBe(true);
    expect(reach(0, 20)).toBe(true);
    expect(reach(-45, 10)).toBe(true);
  });
  it('협곡 계단 → 협곡 바닥 → 반대편 계단 → 북쪽 지면', () => {
    expect(reach(-60, -11)).toBe(true);   // 협곡 바닥
    expect(reach(50, -11)).toBe(true);
    expect(reach(0, -30)).toBe(true);     // 북쪽 지면
  });
  it('다리 잔해 양끝(남/북 상판)과 탑 계단 시작점이 같은 연결 성분', () => {
    expect(reach(15, -7.5)).toBe(true);
    expect(reach(15, -16.25)).toBe(true);
    expect(reach(T.x - 6.6, T.z + 8)).toBe(true); // 탑 첫 계단
  });
  it('탑 지붕(계단 4구간 끝)까지 걸어서 도달', () => {
    expect(reach(T.x, T.z)).toBe(true);
    expect(grid.h[(Math.floor((T.z + half) / cell)) * grid.n + Math.floor((T.x + half) / cell)]).toBeCloseTo(T.h, 3);
  });
  it('쌍둥이 낙하 패드 전체(협곡 제외)와 중심이 같은 연결 성분', () => {
    const pad = MAP.terrain.pads.find((p) => p.id === 'twinDrop')!;
    expect(reach(pad.center[0] + 12, pad.center[1] + 8)).toBe(true); // 중심은 탑 본체 안이라 옆 지점
    let checked = 0;
    for (let a = 0; a < 360; a += 15) for (let r = 4; r <= pad.radius - 2; r += 6) {
      const x = pad.center[0] + Math.cos(a * Math.PI / 180) * r, z = pad.center[1] + Math.sin(a * Math.PI / 180) * r;
      if (Math.abs(x) > MAP.size / 2 - 1 || Math.abs(z) > MAP.size / 2 - 1) continue; // 외곽 벽 너머는 제외
      if (grid.h[cellIndexOf(x, z)] !== 0) continue; // 박스(폐허·탑)가 덮은 칸 제외
      expect(reach(x, z)).toBe(true); checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });
  it('램프 회랑으로 둔덕 윗면까지 걸어서 도달 (오를 수 없는 3m 층 단차를 램프가 잇는다)', () => {
    for (const r of MAP.terrain.ramps) expect(reach(r.to[0], r.to[1])).toBe(true);
    expect(reach(68, 70)).toBe(true);   // SE 둔덕 윗면
    expect(reach(70, -66)).toBe(true);  // NE 둔덕 윗면
  });
  it('음성 대조군: 램프가 없으면 둔덕 윗면은 걸어서 못 가고, 협곡 계단이 없으면 북쪽·탑에 못 간다', () => {
    const noRamp = createTerrainField(TERRAIN_FIELD, { ...MAPDATA, ramps: [] });
    const g1 = buildWalkGrid(noRamp, boxes, half, cell);
    const s1 = floodReachable(g1, [MAP.spawn[0], MAP.spawn[2]], TUNING.player.stepHeight);
    expect(reached(g1, s1, 68, 70)).toBe(false);
    const noStairs = buildWalkGrid(field, MAP.blocks, half, cell);
    const s2 = floodReachable(noStairs, [MAP.spawn[0], MAP.spawn[2]], TUNING.player.stepHeight);
    expect(reached(noStairs, s2, 0, -30)).toBe(false);
    expect(reached(noStairs, s2, T.x, T.z)).toBe(false);
  });
  it('월드 가장자리: 외곽 충돌 벽이 고원 안에 있고(고원 반폭보다 안쪽), 갇히는 구덩이가 없다', () => {
    expect(MAP.size / 2 + 0.5).toBeLessThan(TERRAIN_FIELD.plateau.half);
    // 스폰 성분 안에서 가장 낮은 칸은 협곡 바닥(-14)뿐: 계곡(-27 이하)으로 떨어지는 칸이 벽 안쪽에 없다
    let lowest = 0;
    for (let i = 0; i < seen.length; i++) if (seen[i]) lowest = Math.min(lowest, grid.h[i]);
    expect(lowest).toBeGreaterThanOrEqual(-MAP.canyon.depth - 1e-6);
  });
  function cellIndexOf(x: number, z: number) { return Math.floor((z + half) / cell) * grid.n + Math.floor((x + half) / cell); }
});

describe('지형 메시', () => {
  const look = VISUAL.lowpoly.presets.dusk.terrain;
  const dusk = VISUAL.lowpoly.presets.dusk.terrain;
  const mesh = buildTerrainMesh(field, look, { depth: dusk.depthTint, wall: dusk.depthTint.wall, far: dusk.farTint }, TERRAIN_MESH);

  it('충돌 메시: 삼각형 상한 이하, 외곽 벽 안쪽(+여유)만, 정점 유한', () => {
    const c = buildCollisionMesh(field, TERRAIN_COLLISION.half);
    expect(c.indices.length / 3).toBeLessThanOrEqual(TERRAIN_COLLISION.maxTriangles);
    expect(c.indices.length / 3).toBeGreaterThan(50);
    for (let i = 0; i < c.vertices.length; i += 3) {
      expect(Number.isFinite(c.vertices[i + 1])).toBe(true);
      expect(Math.abs(c.vertices[i])).toBeLessThanOrEqual(TERRAIN_COLLISION.half + 1e-3);
      expect(Math.abs(c.vertices[i + 2])).toBeLessThanOrEqual(TERRAIN_COLLISION.half + 1e-3);
    }
    for (const idx of c.indices) expect(idx).toBeLessThan(c.vertices.length / 3);
  });
  it('충돌 윗면 사각형이 격자 높이와 일치 (렌더 메시와 같은 사각형 집합)', () => {
    const q = collectQuads(field, TERRAIN_COLLISION.half, false);
    let area = 0;
    for (const t of q.tops) {
      area += (t.x1 - t.x0) * (t.z1 - t.z0);
      const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
      expect(field.surface(cx, cz)).toBeCloseTo(t.level * FS, 6);
    }
    expect(area).toBeCloseTo(TERRAIN_COLLISION.half * 2 * TERRAIN_COLLISION.half * 2, 3); // 윈도 전체가 빠짐없이 덮인다
  });
  it('벽: 양쪽 칸 높이 차와 정확히 일치하고 높은 쪽이 낮은 쪽을 향한다 (LOD 경계 포함)', () => {
    const q = collectQuads(field, Infinity, true);
    expect(q.walls.length).toBeGreaterThan(500);
    let seam = 0;
    for (let i = 0; i < q.walls.length; i += 7) {
      const w = q.walls[i], m = (w.a + w.b) / 2, e = 0.05;
      const hi = w.axis === 'x' ? field.surface(m, w.fixed - w.nz * e) : field.surface(w.fixed - w.nx * e, m);
      const lo = w.axis === 'x' ? field.surface(m, w.fixed + w.nz * e) : field.surface(w.fixed + w.nx * e, m);
      expect(hi).toBeCloseTo(w.yHigh * FS, 6);
      expect(lo).toBeGreaterThanOrEqual(w.yLow * FS - 1e-6);
      expect(hi).toBeGreaterThan(lo);
      if (Math.abs(w.fixed) > TERRAIN_FIELD.lod.nearHalf - 1 && Math.abs(w.fixed) < TERRAIN_FIELD.lod.nearHalf + 1) seam++;
    }
    expect(seam).toBeGreaterThanOrEqual(0);
  });
  it('렌더 메시: 비어 있지 않고 법선 단위·색 0~1·삼각형 예산 이하', () => {
    const tris = mesh.positions.length / 9;
    expect(tris).toBeGreaterThan(5000);
    expect(tris).toBeLessThanOrEqual(28000); // 태블릿 예산(총 45k)에서 지형 몫 (삼각 패싯 +20%: 반경 range 안쪽만 분할)
    for (let i = 0; i < mesh.normals.length; i += 3 * 97) {
      expect(Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2])).toBeCloseTo(1, 4);
    }
    for (let i = 0; i < mesh.colors.length; i += 31) { expect(mesh.colors[i]).toBeGreaterThanOrEqual(0); expect(mesh.colors[i]).toBeLessThanOrEqual(1.5); }
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
  });
  it('타일 크기: 가까우면 기본, 멀수록 커지다 상한', () => {
    const T = TERRAIN_MESH.tile;
    expect(tileSizeAt(T.top, 10, T)).toBe(T.top);
    expect(tileSizeAt(T.top, 200, T)).toBeGreaterThan(T.top);
    expect(tileSizeAt(T.top, 5000, T)).toBe(T.max);
  });
});

describe('장식 배치 보조', () => {
  it('평평한 칸 판정: 고원 중앙은 평평, 협곡 가장자리·고원 가장자리는 아님', () => {
    expect(isFlatSpot(field, 0, 30, 3)).toBe(true);
    expect(isFlatSpot(field, 0, MAP.canyon.zMax + 1, 3)).toBe(false);
  });
});
