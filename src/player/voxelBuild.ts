import { decodeVoxels, paletteRgb, type V3, type VoxelFile, type VoxelGrid } from './voxelCodec';
import { meshVoxels, triangleCount, type MeshData, type MeshOptions } from './voxelMesher';
import { NODES, nodePivot, type NodeSpec } from './voxelParts';

/** 노드별 메시 데이터 (THREE 비의존). 발광(화면) 색은 별도 메시로 분리해 재질을 달리한다 */
export interface BuiltNode {
  spec: NodeSpec;
  /** 월드 피벗 (m) */
  pivot: V3;
  mesh: MeshData | null;
  emissive: MeshData | null;
}

export interface BuildOptions {
  aoCurve: MeshOptions['aoCurve'];
  colorScale: number;
  aoPerFace: boolean;
}

const FLAT_AO: MeshOptions['aoCurve'] = [1, 1, 1, 1];

export function buildVoxelNodes(file: VoxelFile, grid: VoxelGrid, o: BuildOptions): BuiltNode[] {
  const palette = file.palette.map(paletteRgb);
  const emissive = new Set(file.emissive);
  return NODES.map((spec): BuiltNode => {
    const pivot = nodePivot(file, spec);
    if (spec.parts.length === 0) return { spec, pivot, mesh: null, emissive: null };
    const ids = new Set(spec.parts.map((n) => {
      const i = file.parts.indexOf(n);
      if (i < 0) throw new Error(`데이터에 없는 부위: ${n}`);
      return i;
    }));
    const base: Omit<MeshOptions, 'aoCurve' | 'colorScale' | 'aoPerFace'> = { voxelSize: file.voxelSize, origin: file.origin, pivot, palette };
    const body = meshVoxels(grid, (p, c) => ids.has(p) && !emissive.has(c), { ...base, aoCurve: o.aoCurve, colorScale: o.colorScale, aoPerFace: o.aoPerFace });
    const glow = meshVoxels(grid, (p, c) => ids.has(p) && emissive.has(c), { ...base, aoCurve: FLAT_AO, colorScale: 1, aoPerFace: true });
    return { spec, pivot, mesh: body.quads ? body : null, emissive: glow.quads ? glow : null };
  });
}

export function decodeAndBuild(file: VoxelFile, o: BuildOptions) {
  const grid = decodeVoxels(file);
  return { grid, nodes: buildVoxelNodes(file, grid, o) };
}

/** 삼각형 수·드로우콜(메시 수) 합계 */
export function budgetOf(nodes: readonly BuiltNode[]): { triangles: number; drawCalls: number } {
  let triangles = 0, drawCalls = 0;
  for (const n of nodes) {
    for (const m of [n.mesh, n.emissive]) {
      if (!m) continue;
      triangles += triangleCount(m);
      drawCalls++;
    }
  }
  return { triangles, drawCalls };
}
