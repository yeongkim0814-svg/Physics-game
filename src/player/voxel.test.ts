import { describe, expect, it } from 'vitest';
import { VISUAL } from '../config/settings';
import voxelJson from '../assets/protagonist_voxels.json';
import { budgetOf, decodeAndBuild } from './voxelBuild';
import { decodeRuns, decodeVoxels, encodeRuns, paletteRgb, SYMBOL_PART_SHIFT, type VoxelFile, type VoxelGrid } from './voxelCodec';
import { meshVoxels, triangleCount, vertexAO, type MeshOptions } from './voxelMesher';
import { NODES, nodeLocalPosition, partBounds } from './voxelParts';

const FILE = voxelJson as unknown as VoxelFile;
const V = VISUAL.voxelCharacter;
const BUILD = { aoCurve: V.aoCurve, colorScale: VISUAL.lowpoly.character.exposure, aoPerFace: V.aoPerFace };

const tiny = (cells: [number, number, number, number, number][], nx = 4, ny = 4, nz = 4): VoxelGrid => {
  const g: VoxelGrid = { nx, ny, nz, part: new Uint8Array(nx * ny * nz), color: new Uint8Array(nx * ny * nz) };
  for (const [x, y, z, part, color] of cells) { const i = (y * nz + z) * nx + x; g.part[i] = part; g.color[i] = color; }
  return g;
};
const MO: MeshOptions = { voxelSize: 1, origin: [0, 0, 0], pivot: [0, 0, 0], palette: [[1, 0, 0], [0, 1, 0]], aoCurve: [0.5, 0.6, 0.8, 1], colorScale: 1, aoPerFace: false };

describe('RLE/팔레트 코덱', () => {
  it('encodeRuns → decodeRuns 왕복, 긴 런·큰 심볼 (varint 다바이트)', () => {
    const sym = new Uint16Array(1000);
    sym.fill(0, 0, 400);
    sym.fill((18 << SYMBOL_PART_SHIFT) | 30, 400, 700); // 1182: 2바이트 varint
    sym.fill(5, 700, 1000);
    const back = decodeRuns(encodeRuns(sym), sym.length);
    expect(Array.from(back)).toEqual(Array.from(sym));
  });
  it('길이가 맞지 않으면 예외', () => {
    expect(() => decodeRuns(encodeRuns([1, 1, 2]), 5)).toThrow();
    expect(() => decodeRuns(encodeRuns([1, 1, 2]), 2)).toThrow();
  });
  it('팔레트 hex → 0..1 RGB', () => {
    expect(paletteRgb('ff8000')).toEqual([1, 128 / 255, 0]);
  });
  it('실제 데이터: 격자 크기와 복셀 수, 키 1.8m, 부위 id 가 유효', () => {
    const g = decodeVoxels(FILE);
    expect(g.part.length).toBe(FILE.size[0] * FILE.size[1] * FILE.size[2]);
    expect(FILE.size[1] * FILE.voxelSize).toBeCloseTo(1.8, 3);
    let solid = 0;
    for (let i = 0; i < g.part.length; i++) {
      if (g.part[i] === 0) { expect(g.color[i]).toBe(0); continue; }
      solid++;
      expect(g.part[i]).toBeLessThan(FILE.parts.length);
      expect(g.color[i]).toBeGreaterThanOrEqual(1);
      expect(g.color[i]).toBeLessThanOrEqual(FILE.palette.length);
    }
    expect(solid).toBeGreaterThan(5000);
  });
});

describe('그리디 메싱', () => {
  it('단일 복셀 = 6 면 12 삼각형', () => {
    const m = meshVoxels(tiny([[1, 1, 1, 1, 1]]), () => true, MO);
    expect(m.quads).toBe(6);
    expect(triangleCount(m)).toBe(12);
  });
  it('같은 색 2x2x2 큐브 = 6 사각형으로 병합 (면 24칸)', () => {
    const cells: [number, number, number, number, number][] = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) cells.push([x + 1, y + 1, z + 1, 1, 1]);
    const m = meshVoxels(tiny(cells), () => true, MO);
    expect(m.quads).toBe(6);
  });
  it('색이 다르면 병합하지 않는다 (2x1 막대: 같은 색 6, 다른 색 10 사각형)', () => {
    const same = meshVoxels(tiny([[1, 1, 1, 1, 1], [2, 1, 1, 1, 1]]), () => true, MO);
    const diff = meshVoxels(tiny([[1, 1, 1, 1, 1], [2, 1, 1, 1, 2]]), () => true, MO);
    expect(same.quads).toBe(6);
    expect(diff.quads).toBe(10);
  });
  it('다른 그룹 이웃과 맞닿은 면은 남긴다 (그룹이 따로 움직여도 구멍이 없다)', () => {
    const g = tiny([[1, 1, 1, 1, 1], [2, 1, 1, 2, 1]]);
    const a = meshVoxels(g, (p) => p === 1, MO);
    expect(a.quads).toBe(6);
  });
  it('법선이 바깥을 향한다 (삼각형 감김 방향과 일치)', () => {
    const m = meshVoxels(tiny([[1, 1, 1, 1, 1]]), () => true, MO);
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      const P = (i: number) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
      const [pa, pb, pc] = [P(a), P(b), P(c)];
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nn = [m.normals[a * 3], m.normals[a * 3 + 1], m.normals[a * 3 + 2]];
      expect(n[0] * nn[0] + n[1] * nn[1] + n[2] * nn[2]).toBeGreaterThan(0);
    }
  });
  it('AO: 코너 가림 규칙 (양쪽 가림 = 0, 없음 = 3)', () => {
    expect(vertexAO(false, false, false)).toBe(3);
    expect(vertexAO(true, false, false)).toBe(2);
    expect(vertexAO(true, false, true)).toBe(1);
    expect(vertexAO(true, true, false)).toBe(0);
    expect(vertexAO(false, false, true)).toBe(2);
  });
  it('오목한 모서리의 정점색이 평면 정점색보다 어둡다', () => {
    // L 자 바닥+벽: 바닥 윗면 중 벽에 붙은 칸의 정점이 어둡다
    const g = tiny([[1, 1, 1, 1, 1], [2, 1, 1, 1, 1], [1, 2, 1, 1, 1]]);
    const m = meshVoxels(g, () => true, MO);
    const lum = Array.from({ length: m.colors.length / 3 }, (_, i) => m.colors[i * 3]);
    expect(Math.min(...lum)).toBeLessThan(Math.max(...lum));
  });
});

describe('부위 분할·피벗', () => {
  const g = decodeVoxels(FILE);
  it('모든 부위가 노드에 정확히 한 번 배정된다', () => {
    const assigned = NODES.flatMap((n) => n.parts);
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const p of FILE.parts.slice(1)) expect(assigned).toContain(p);
    for (const p of assigned) expect(FILE.parts).toContain(p);
  });
  it('노드의 부모는 항상 앞에 있고 피벗 키가 데이터에 있다', () => {
    const seen = new Set<string>();
    for (const n of NODES) {
      if (n.parent) expect(seen.has(n.parent)).toBe(true);
      if (n.pivot) expect(FILE.pivots[n.pivot]).toBeDefined();
      seen.add(n.name);
    }
  });
  it('모든 부위에 복셀이 있다 (분할 실패 감지)', () => {
    for (const p of FILE.parts.slice(1)) expect(partBounds(FILE, g, [p])?.count ?? 0).toBeGreaterThan(5);
  });
  it('관절 피벗은 연결된 부위 바운딩박스 높이 안(또는 경계)에 있다', () => {
    const tol = 2 * FILE.voxelSize;
    const within = (key: string, parts: string[]) => {
      const b = partBounds(FILE, g, parts)!;
      const p = FILE.pivots[key];
      expect(p[1]).toBeGreaterThanOrEqual(b.min[1] - tol);
      expect(p[1]).toBeLessThanOrEqual(b.max[1] + tol);
    };
    for (const s of ['R', 'L']) {
      within(`shoulder${s}`, [`arm${s}_upper`]);
      within(`elbow${s}`, [`arm${s}_upper`, `arm${s}_fore`]);
      within(`knee${s}`, [`thigh${s}`, `shin${s}`]);
      within(`ankle${s}`, [`shin${s}`, `foot${s}`]);
    }
    within('neck', ['head', 'torso']);
    within('waist', ['torso', 'pelvis']);
  });
  it('좌우 피벗은 x 부호가 반대, 위아래 순서: 어깨 > 팔꿈치, 고관절 > 무릎 > 발목', () => {
    const P = FILE.pivots;
    expect(P.shoulderR[0]).toBeGreaterThan(0);
    expect(P.shoulderL[0]).toBeLessThan(0);
    expect(P.hipR[0]).toBeGreaterThan(0);
    expect(P.hipL[0]).toBeLessThan(0);
    for (const s of ['R', 'L']) {
      expect(P[`shoulder${s}`][1]).toBeGreaterThan(P[`elbow${s}`][1]);
      expect(P[`hip${s}`][1]).toBeGreaterThan(P[`knee${s}`][1]);
      expect(P[`knee${s}`][1]).toBeGreaterThan(P[`ankle${s}`][1]);
    }
    expect(P.neck[1]).toBeGreaterThan(P.waist[1]);
  });
  it('노드 로컬 위치 = 피벗 - 부모 피벗 (정강이는 허벅지 기준으로 아래)', () => {
    const shin = NODES.find((n) => n.name === 'shinR')!;
    expect(nodeLocalPosition(FILE, shin)[1]).toBeLessThan(0);
    const torso = NODES.find((n) => n.name === 'torso')!;
    expect(nodeLocalPosition(FILE, torso)).toEqual([0, 0, 0]);
  });
  it('장치: 총구는 장치 바운딩박스 아래 끝 앞면, 손은 장치 위쪽', () => {
    const b = partBounds(FILE, g, ['device'])!;
    const m = FILE.pivots.deviceMuzzle, h = FILE.pivots.deviceHand;
    expect(m[1]).toBeCloseTo(b.min[1], 3);
    expect(m[2]).toBeCloseTo(b.min[2], 3);
    expect(h[1]).toBeGreaterThan(m[1]);
    expect(h[1]).toBeLessThan(b.max[1]);
  });
  it('발바닥이 y=0 에 있다', () => {
    const b = partBounds(FILE, g, ['footR', 'footL'])!;
    expect(b.min[1]).toBeCloseTo(0, 5);
  });
});

describe('성능 예산', () => {
  const { nodes } = decodeAndBuild(FILE, BUILD);
  const stats = budgetOf(nodes);
  it(`삼각형 ≤ ${V.budget.triangles}`, () => {
    expect(stats.triangles).toBeLessThanOrEqual(V.budget.triangles);
  });
  it(`드로우콜(메시) ≤ ${V.budget.drawCalls}`, () => {
    expect(stats.drawCalls).toBeLessThanOrEqual(V.budget.drawCalls);
  });
  it('발광(화면) 복셀이 있고 별도 메시로 분리된다', () => {
    expect(nodes.find((n) => n.spec.name === 'device')?.emissive).not.toBeNull();
  });
  it('모든 정점 인덱스가 범위 안이고 좌표가 유한하다', () => {
    for (const n of nodes) for (const m of [n.mesh, n.emissive]) {
      if (!m) continue;
      const count = m.positions.length / 3;
      for (const i of m.indices) expect(i).toBeLessThan(count);
      for (const v of m.positions) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
