import type { V3, VoxelFile, VoxelGrid } from './voxelCodec';

/**
 * 복셀 부위 → 씬 그래프 노드 매핑 (THREE 비의존, 테스트 대상).
 * 부위 id 는 데이터(file.parts)가 정하고, 이 표는 "어느 부위를 어느 관절 노드에 매다는가"를 정한다.
 * 피벗은 scripts/carve_character.py 가 부위 바운딩박스와 도면 높이 비율로 계산해 file.pivots 에 넣는다 (월드 m, 루트=발바닥 중앙).
 * 노드 로컬 위치 = 자기 피벗 - 부모 피벗. 지오메트리 정점은 자기 피벗 기준 좌표.
 */
export interface NodeSpec {
  name: string;
  /** 이 노드의 메시가 담는 부위 이름들 (비면 메시 없는 관절 노드) */
  parts: readonly string[];
  /** 부모 노드 이름 (null = body) */
  parent: string | null;
  /** file.pivots 키 (null = body 원점) */
  pivot: string | null;
}

const side = (s: 'R' | 'L'): NodeSpec[] => [
  { name: `armUpper${s}`, parts: [`arm${s}_upper`], parent: 'waist', pivot: `shoulder${s}` },
  { name: `armFore${s}`, parts: [`arm${s}_fore`], parent: `armUpper${s}`, pivot: `elbow${s}` },
  { name: `thigh${s}`, parts: [`thigh${s}`], parent: null, pivot: `hip${s}` },
  { name: `shin${s}`, parts: [`shin${s}`], parent: `thigh${s}`, pivot: `knee${s}` },
  { name: `foot${s}`, parts: [`foot${s}`], parent: `shin${s}`, pivot: `ankle${s}` },
];

/** 부모가 항상 자식보다 앞에 오도록 정렬 */
export const NODES: readonly NodeSpec[] = [
  { name: 'pelvis', parts: ['pelvis'], parent: null, pivot: null },
  { name: 'waist', parts: [], parent: null, pivot: 'waist' },
  { name: 'torso', parts: ['torso'], parent: 'waist', pivot: 'waist' },
  { name: 'head', parts: ['head'], parent: 'waist', pivot: 'neck' },
  ...side('R'), ...side('L'),
  // 장치는 오른쪽 아래팔에 매달린다 (팔꿈치 피벗을 공유 → 아래팔과 같은 로컬 좌표)
  { name: 'device', parts: ['device'], parent: 'armForeR', pivot: 'elbowR' },
  { name: 'skirtF', parts: ['skirtF'], parent: null, pivot: 'skirt' },
  { name: 'skirtB', parts: ['skirtB'], parent: null, pivot: 'skirt' },
  { name: 'sashF', parts: ['sashF'], parent: null, pivot: 'sashF' },
  { name: 'sashB', parts: ['sashB'], parent: null, pivot: 'sashB' },
];

export const ZERO: V3 = [0, 0, 0];

export function pivotOf(file: Pick<VoxelFile, 'pivots'>, key: string | null): V3 {
  if (key === null) return ZERO;
  const p = file.pivots[key];
  if (!p) throw new Error(`피벗 없음: ${key}`);
  return p;
}

/** 노드 월드 피벗 */
export function nodePivot(file: Pick<VoxelFile, 'pivots'>, spec: NodeSpec): V3 {
  return pivotOf(file, spec.pivot);
}

/** 부모 기준 노드 로컬 위치 */
export function nodeLocalPosition(file: Pick<VoxelFile, 'pivots'>, spec: NodeSpec): V3 {
  const me = nodePivot(file, spec);
  const parent = spec.parent ? NODES.find((n) => n.name === spec.parent) : undefined;
  if (spec.parent && !parent) throw new Error(`부모 노드 없음: ${spec.parent}`);
  const pp = parent ? nodePivot(file, parent) : ZERO;
  return [me[0] - pp[0], me[1] - pp[1], me[2] - pp[2]];
}

export interface Bounds { min: V3; max: V3; count: number }

/** 부위들의 복셀 바운딩박스 (월드 m, 셀 모서리 기준) */
export function partBounds(file: Pick<VoxelFile, 'origin' | 'voxelSize' | 'parts'>, g: VoxelGrid, partNames: readonly string[]): Bounds | null {
  const ids = new Set(partNames.map((n) => file.parts.indexOf(n)));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  for (let y = 0; y < g.ny; y++) {
    for (let z = 0; z < g.nz; z++) {
      for (let x = 0; x < g.nx; x++) {
        if (!ids.has(g.part[(y * g.nz + z) * g.nx + x])) continue;
        count++;
        const c = [x, y, z];
        for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a]); }
      }
    }
  }
  if (!count) return null;
  const w = (a: number, i: number, off: number) => (i + off - file.origin[a]) * file.voxelSize;
  return {
    min: [w(0, lo[0], -0.5), w(1, lo[1], -0.5), w(2, lo[2], -0.5)],
    max: [w(0, hi[0], 0.5), w(1, hi[1], 0.5), w(2, hi[2], 0.5)],
    count,
  };
}
