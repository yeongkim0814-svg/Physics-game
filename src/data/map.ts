import type { MobKind } from '../core/types';
import type { StairDef, Vec3 } from '../world/mapGen';

/**
 * 샌드박스 맵 데이터 (단위 m, 좌표 x/z 는 맵 중심 기준, y 는 지면 0).
 * 레이아웃은 코드 수정 없이 여기서 바꾼다. 월드 빌더(world/GameWorld.ts)가 읽는다.
 *
 * 구역: 남쪽 스폰(평지+엄폐물) → 서쪽 물웅덩이 → 중앙 장애물 → 동쪽 금속 구조물 → 북쪽 고지(계단/반동 점프)
 */
export type BlockKind = 'concrete' | 'metal';
export interface BlockDef { pos: Vec3; size: Vec3; kind: BlockKind }
export interface StairMapDef extends StairDef { kind: BlockKind }
export interface WaterDef { center: [number, number]; size: [number, number] }
export interface MobSpawnDef { kind: MobKind; pos: [number, number, number] }

const C = (pos: Vec3, size: Vec3): BlockDef => ({ pos, size, kind: 'concrete' });
const M = (pos: Vec3, size: Vec3): BlockDef => ({ pos, size, kind: 'metal' });

export const MAP = {
  /** 한 변 길이. 외벽은 자동 생성 */
  size: 120,
  wallHeight: 6,
  spawn: [0, 0.2, 50] as Vec3,

  blocks: [
    // --- 남쪽 평지 엄폐물 ---
    C([-12, 1, 38], [6, 2, 3]), C([10, 0.75, 32], [4, 1.5, 4]),
    C([-4, 1, 24], [8, 2, 2]), C([18, 1, 44], [3, 2, 6]),
    // --- 중앙 장애물 ---
    C([0, 1.5, 5], [14, 3, 1.5]), C([-20, 1.5, 0], [1.5, 3, 12]),
    C([14, 1, -8], [5, 2, 5]), C([-6, 2, -12], [6, 4, 6]),
    // --- 서쪽 물웅덩이 안 섬(서 있으면 누전 안전) ---
    C([-32, 0.5, 14], [3, 1, 3]),
    // --- 북쪽 고지 (높이 6, 계단 또는 반동 점프로 진입) ---
    C([-8, 3, -38], [26, 6, 24]),
    // --- 동쪽 금속 구조물 구역 (노드 간격이 연쇄 반경 이내라 전체가 이어진다) ---
    M([26, 1, 6], [4, 2, 4]), M([32, 1.5, 10], [3, 3, 3]), M([38, 1, 4], [6, 2, 3]),
    M([34, 0.4, -2], [16, 0.8, 0.8]), M([30, 1, -10], [4, 2, 4]),
    M([44, 2, -6], [2, 4, 2]), M([44, 2, 6], [2, 4, 2]),
    M([34.5, 1.5, -14], [1, 3, 1]), M([45.5, 1.5, -14], [1, 3, 1]),
    M([40, 3.3, -14], [14, 0.6, 5]), // 캣워크
    // 바닥 배관(낮은 레일): 크레이트 사이를 이어 금속 구역 전체가 한 연쇄망이 되게 한다 (노드 간격 ≤ 연쇄 반경)
    M([29, 0.25, 8.5], [5, 0.5, 0.6]), M([35, 0.25, 7], [0.6, 0.5, 6]),
    M([37, 0.25, 1], [0.6, 0.5, 5]), M([30, 0.25, -6], [0.6, 0.5, 4.4]),
  ] as BlockDef[],

  stairs: [
    // 고지 남쪽면 (16단 × 0.375 = 6m). 깊이 ≥ 캡슐 지름(0.7m) 이어야 자동 계단 오르기가 동작한다
    { kind: 'concrete', start: [-14, -10.5], dir: '-z', steps: 16, width: 4, stepH: 0.375, stepD: 1.0 },
    // 캣워크 금속 계단 (10단 × 0.36 = 3.6m, 캣워크 윗면과 같은 높이)
    { kind: 'metal', start: [23.5, -14], dir: '+x', steps: 10, width: 3, stepH: 0.36, stepD: 1.0 },
  ] as StairMapDef[],

  water: [
    { center: [-32, 14], size: [24, 18] },
    { center: [-30, -24], size: [16, 14] },
    { center: [-14, -1], size: [6, 18] },
  ] as WaterDef[],

  /** 몹 종류별 배치 */
  mobSpawns: [
    { kind: 'normal', pos: [-26, 0, 34] }, { kind: 'normal', pos: [12, 0, 20] }, { kind: 'normal', pos: [-18, 0, -12] },
    { kind: 'insulator', pos: [-10, 0, 18] }, { kind: 'insulator', pos: [6, 0, -2] }, { kind: 'insulator', pos: [14, 0, -18] },
    { kind: 'metal', pos: [30, 0, 2] }, { kind: 'metal', pos: [36, 0, -8] }, { kind: 'metal', pos: [48, 0, 0] },
  ] as MobSpawnDef[],
};
