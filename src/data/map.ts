import type { MobKind } from '../core/types';
import type { StairDef, Vec3 } from '../world/mapGen';

/**
 * 말라붙은 해안 도시 일부 (GAME_DESIGN 9절). 단위 m, 좌표 x/z 는 맵 중심 기준, 지면 윗면 y=0.
 * 레이아웃은 코드 수정 없이 여기서 바꾼다. 월드 빌더(world/GameWorld.ts)가 읽는다.
 *
 * 구역(북쪽이 -z): 남쪽 스폰 평지 → 폐허 건물 블록 → 동서로 가로지르는 물 빠진 협곡(다리 잔해·계단) → 북쪽 높은 탑
 * 맵 밖 먼 곳에는 안개 너머 랜드마크 실루엣(landmarks)과 달이 있다.
 */
export type BlockKind = 'concrete' | 'metal';
export interface BlockDef { pos: Vec3; size: Vec3; kind: BlockKind }
export interface StairMapDef extends StairDef { kind: BlockKind }
export interface WaterDef { center: [number, number]; size: [number, number] }
export interface MobSpawnDef { kind: MobKind; pos: [number, number, number] }
export interface GroundDef { pos: Vec3; size: Vec3 }
/** 안개 무시 실루엣 (맵 밖 원경). band 는 밑동의 탈색 구간 */
export interface LandmarkDef { pos: Vec3; size: Vec3; color: number; band?: { height: number; color: number } }

const C = (pos: Vec3, size: Vec3): BlockDef => ({ pos, size, kind: 'concrete' });

// --- 협곡 (x 방향으로 맵 전체를 가로지른다) ---
const HALF = 80;            // 맵 반 변 길이
const MARGIN = 4;           // 지면 박스가 맵 밖으로 조금 더 뻗는 길이
const EDGE = HALF + MARGIN;
const CANYON = { zMin: -18, zMax: -4, depth: 14 };
const CANYON_W = CANYON.zMax - CANYON.zMin;
const SLAB = 15;            // 지면 박스 두께 (윗면 y=0 아래로). 협곡 깊이보다 커야 한다

// --- 탑 (한 변 14m, 높이 30m). 바깥을 감싸는 4구간 계단으로 지붕까지 걸어서 오른다 ---
const T = { x: -30, z: -52, w: 14, h: 30 };
const TS = { stepH: 0.4, stepD: 0.8, width: 2 };           // 계단 한 단 0.4m ≤ 자동 계단 한계(0.5m)
const run = (steps: number, rise0: number) => ({ kind: 'concrete' as const, steps, baseY: rise0, ...TS });
const TH = T.w / 2;
const TS_BAND = TH + TS.width / 2;                          // 탑 중심에서 계단 폭 중심까지
const TS_EDGE = TH - TS.stepD / 2;                          // 코너에서 첫 단 중심까지
const PARAPET = { h: 0.9, t: 0.4 };

export const MAP = {
  /** 한 변 길이. 외곽은 보이지 않는 충돌 벽(지평선을 가리지 않음) */
  size: HALF * 2,
  wallHeight: 80,
  /** 지면 박스가 맵 밖으로 뻗는 길이 / 두께 (GameWorld 의 맵 밖 평원 띠가 쓴다) */
  groundMargin: MARGIN,
  groundThickness: SLAB,
  spawn: [0, 0.2, 52] as Vec3,

  /** 지면 윗면 y=0 박스들 + 협곡 바닥. 협곡 폭 사이는 비워 둔다 */
  ground: [
    { pos: [0, -SLAB / 2, (CANYON.zMax + EDGE) / 2], size: [EDGE * 2, SLAB, EDGE - CANYON.zMax] },     // 남쪽 지면
    { pos: [0, -SLAB / 2, (CANYON.zMin - EDGE) / 2], size: [EDGE * 2, SLAB, EDGE + CANYON.zMin] },     // 북쪽 지면
    { pos: [0, -CANYON.depth - 0.5, (CANYON.zMin + CANYON.zMax) / 2], size: [EDGE * 2, 1, CANYON_W] }, // 협곡 바닥
  ] as GroundDef[],

  blocks: [
    // --- 남쪽 폐허 건물 블록 ---
    C([-34, 5, 16], [14, 10, 12]), C([-12, 3, 20], [8, 6, 8]), C([10, 6, 22], [12, 12, 10]),
    C([36, 3, 14], [10, 6, 14]), C([-55, 4, 28], [10, 8, 12]), C([58, 4, 26], [8, 8, 10]),
    // 무너진 담
    C([0, 1.5, 8], [16, 3, 1.2]), C([-22, 2, 6], [1.2, 4, 10]), C([26, 1.5, 4], [1.2, 3, 8]),
    // 스폰 근처 낮은 잔해 (평지 느낌 유지)
    C([-8, 0.6, 46], [4, 1.2, 3]), C([9, 0.4, 40], [3, 0.8, 5]), C([20, 1, 52], [2, 2, 6]),
    // --- 협곡 다리 잔해: 남쪽에서 7m, 북쪽에서 3.5m 뻗은 상판 → 사이 3.5m 틈은 달리기 점프 또는 반동 이동 ---
    C([15, -0.3, -7.5], [4, 0.6, 7]), C([15, -0.3, -16.25], [4, 0.6, 3.5]),
    // 협곡 바닥 바위
    C([-10, -12, -11], [6, 4, 5]), C([30, -12.5, -9], [4, 3, 6]), C([-48, -13, -13], [5, 2, 4]),
    // --- 북쪽 폐허 ---
    C([10, 5, -40], [12, 10, 10]), C([40, 3, -36], [10, 6, 12]), C([-62, 4, -30], [10, 8, 10]),
    C([50, 2, -60], [12, 4, 10]), C([-5, 2, -70], [14, 4, 6]),
    C([-10, 1.5, -30], [10, 3, 1.2]), C([25, 1.5, -26], [1.2, 3, 8]),
    // --- 높은 탑 본체 + 지붕 난간(서쪽 면은 계단이 닿는 구간을 비움) ---
    C([T.x, T.h / 2, T.z], [T.w, T.h, T.w]),
    C([T.x, T.h + PARAPET.h / 2, T.z - TH + PARAPET.t / 2], [T.w, PARAPET.h, PARAPET.t]),
    C([T.x, T.h + PARAPET.h / 2, T.z + TH - PARAPET.t / 2], [T.w, PARAPET.h, PARAPET.t]),
    C([T.x + TH - PARAPET.t / 2, T.h + PARAPET.h / 2, T.z], [PARAPET.t, PARAPET.h, T.w]),
    C([T.x - TH + PARAPET.t / 2, T.h + PARAPET.h / 2, T.z - 2.5], [PARAPET.t, PARAPET.h, 9]),
  ] as BlockDef[],

  stairs: [
    // 탑: 남면(동쪽으로) → 동면(북쪽으로) → 북면(서쪽으로) → 서면(남쪽으로). 구간 끝 높이 8 / 16 / 24 / 30m
    { start: [T.x - TS_EDGE, T.z + TS_BAND], dir: '+x', ...run(20, 0) },
    { start: [T.x + TS_BAND, T.z + TS_EDGE], dir: '-z', ...run(20, 8) },
    { start: [T.x + TS_EDGE, T.z - TS_BAND], dir: '-x', ...run(20, 16) },
    { start: [T.x - TS_BAND, T.z - TS_EDGE], dir: '+z', ...run(15, 24) },
    // 협곡 안으로 오르내리는 계단 (남쪽 벽 서쪽 / 북쪽 벽 동쪽). 깊이 14m = 35단 × 0.4m
    { kind: 'concrete', start: [-69.5, -5.5], dir: '+x', steps: 35, width: 3, stepH: 0.4, stepD: 1, baseY: -CANYON.depth, floorY: -CANYON.depth },
    { kind: 'concrete', start: [69.5, -16.5], dir: '-x', steps: 35, width: 3, stepH: 0.4, stepD: 1, baseY: -CANYON.depth, floorY: -CANYON.depth },
  ] as StairMapDef[],

  /** 물웅덩이 없음 (물이 빠진 도시). EmCoil 의 누전 판정 호환용으로 빈 목록을 유지 */
  water: [] as WaterDef[],

  /** 샌드박스 단계에서는 몹을 비운다 (몹 유지 여부 미정. 시스템은 그대로 둠) */
  mobSpawns: [] as MobSpawnDef[],

  /** 지평선 위로 솟은 원경 실루엣. 안개를 무시하고 밑동만 탈색된 느낌 */
  landmarks: [
    { pos: [70, 70, -330], size: [22, 140, 22], color: 0x2b2750, band: { height: 30, color: 0x8d8a96 } },
    { pos: [-120, 35, -310], size: [30, 70, 20], color: 0x2f2b58 },
    { pos: [-10, 20, -340], size: [60, 40, 16], color: 0x342f5e },
  ] as LandmarkDef[],

  /** 하늘의 달 (크림색, 안개 무시) */
  moon: { pos: [-120, 120, -380] as Vec3, radius: 14, color: 0xf2e3b8 },
};
