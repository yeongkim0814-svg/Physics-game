import type { MobKind } from '../core/types';
import { canyonLedges, mesaBlocks, terraceBlocks, type BoxPart, type MesaDef, type StairDef, type TerraceDef, type Vec3 } from '../world/mapGen';

/**
 * 말라붙은 해안 도시 일부 (GAME_DESIGN 9절). 단위 m, 좌표 x/z 는 맵 중심 기준, 지면 윗면 y=0.
 * 레이아웃은 코드 수정 없이 여기서 바꾼다. 월드 빌더(world/GameWorld.ts)가 읽는다.
 *
 * 구역(북쪽이 -z): 남쪽 스폰 평지 → 폐허 건물 블록 → 동서로 가로지르는 물 빠진 협곡(다리 잔해·계단) → 북쪽 높은 탑
 * 맵 밖 먼 곳에는 안개 너머 랜드마크 실루엣(landmarks)과 달이 있다.
 */
export type BlockKind = 'concrete' | 'metal';
/** look = 황혼 블록 지형의 팔레트 (기본 rock). moss = 이끼 확률 배율 */
export interface BlockDef { pos: Vec3; size: Vec3; kind: BlockKind; look?: 'rock' | 'earth' | 'cliff'; moss?: number }
export interface StairMapDef extends StairDef { kind: BlockKind }
export interface WaterDef { center: [number, number]; size: [number, number] }
export interface MobSpawnDef { kind: MobKind; pos: [number, number, number] }
export interface GroundDef { pos: Vec3; size: Vec3 }
/** 안개 무시 실루엣 (맵 밖 원경). band 는 밑동의 탈색 구간 */
/** color/band.color = PS1 실루엣색(발광), lowColor/band.lowColor = 로우폴리 낮 색(안개 원근으로 청백색에 묻힌다), duskColor = 황혼 실루엣색(보라, 안개에 잠긴다) */
export interface LandmarkDef { pos: Vec3; size: Vec3; color: number; lowColor: number; duskColor: number; band?: { height: number; color: number; lowColor: number; duskColor: number } }

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

// --- M1i 황혼 블록 지형 ---
/** 완만한 계단식 단차 (층마다 0.4m ≤ 자동 계단 한계 0.5m, 층 사이 안쪽 후퇴 ≥ 1m 라 걸어서 오른다). 기존 블록·계단·스폰과 겹치지 않는 곳에 둔다 */
const TERRACES: TerraceDef[] = [
  { center: [-28, 44], size: [16, 12], layers: 4, stepH: 0.4, inset: 1.6 },
  { center: [30, 40], size: [14, 14], layers: 3, stepH: 0.4, inset: 1.8 },
  { center: [-60, 48], size: [18, 14], layers: 5, stepH: 0.4, inset: 1.5 },
  { center: [56, 52], size: [16, 12], layers: 4, stepH: 0.4, inset: 1.6 },
  { center: [-4, 33], size: [10, 8], layers: 3, stepH: 0.4, inset: 1.2 },
  { center: [-40, -30], size: [14, 12], layers: 3, stepH: 0.4, inset: 1.6 },
  { center: [-8, -52], size: [12, 10], layers: 4, stepH: 0.4, inset: 1.2 },
  { center: [25, -55], size: [12, 12], layers: 3, stepH: 0.4, inset: 1.6 },
  { center: [66, 6], size: [10, 12], layers: 3, stepH: 0.4, inset: 1.3 },
];
const terraceBlocksAll: BlockDef[] = TERRACES.flatMap((t) => terraceBlocks(t).map((b): BlockDef => ({ ...b, kind: 'concrete', look: 'earth', moss: 1.8 })));

/** 맵 밖 먼 층층 절벽(시각 전용, 충돌 없음, 외곽 벽 너머). 평원 윗면 y = -0.4 에서 쌓는다 */
const MESA_BASE = -0.4;
const MESAS: MesaDef[] = [
  { center: [-140, -70], size: [90, 70], baseY: MESA_BASE, layers: 6, layerH: [7, 15], seed: 101 },
  { center: [-125, 20], size: [60, 70], baseY: MESA_BASE, layers: 5, layerH: [6, 12], seed: 102 },
  { center: [-175, -150], size: [80, 80], baseY: MESA_BASE, layers: 7, layerH: [9, 18], seed: 103 },
  { center: [150, -90], size: [80, 60], baseY: MESA_BASE, layers: 6, layerH: [7, 14], seed: 104 },
  { center: [135, 10], size: [50, 60], baseY: MESA_BASE, layers: 4, layerH: [5, 10], seed: 105 },
  { center: [30, -165], size: [70, 50], baseY: MESA_BASE, layers: 5, layerH: [8, 16], seed: 106 },
  { center: [-75, -200], size: [90, 60], baseY: MESA_BASE, layers: 6, layerH: [9, 18], seed: 107 },
  { center: [-135, 120], size: [70, 60], baseY: MESA_BASE, layers: 4, layerH: [5, 11], seed: 108 },
  { center: [140, 125], size: [70, 60], baseY: MESA_BASE, layers: 5, layerH: [6, 12], seed: 109 },
];
export interface MesaPart extends BoxPart { /** 맵 중심을 향한 면만 만든다 (바깥 면은 맵 안에서 안 보인다) */ center: [number, number] }

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
    // --- M1i 완만한 계단식 단차 ---
    ...terraceBlocksAll,
  ] as BlockDef[],

  /** 탑 제원 (창문·빛기둥 위치용) */
  tower: { x: T.x, z: T.z, w: T.w, h: T.h, roofY: T.h + PARAPET.h },

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

  /** 맵 밖 층층 절벽 (시각 전용). 황혼 프리셋에서만 그린다 */
  mesas: MESAS.flatMap((m) => mesaBlocks(m).map((b): MesaPart => ({ ...b, center: m.center }))),

  /** 협곡 벽 층층 돌출 (시각 전용, 충돌 없음). 계단·다리 잔해 구간은 비운다 */
  ledgeParts: canyonLedges(
    { perWall: 34, depth: [0.5, 1.2], thick: [1, 2.6], width: [4, 12], seed: 41 },
    CANYON, [-82, 82], [[-72, -33], [33, 72], [10, 20]],
  ),

  /**
   * 목적지(관측소) 후보: 구역 중심의 관측소 방향. 백드롭의 성 실루엣·빛기둥은 이 방위(원점 기준)에 그려진다
   * (VISUAL.lowpoly.backdrop.beaconAzimuthDeg 와 일치해야 한다 — 테스트). 안개 너머라 위치만 기록하고 메시는 없다.
   */
  destinations: [{ id: 'observatory', pos: [57, 120, -325] as Vec3, note: '관측소: 성 실루엣 정상의 빛기둥' }],

  /** 지평선 위로 솟은 원경 실루엣. 안개를 무시하고 밑동만 탈색된 느낌 */
  landmarks: [
    { pos: [143, 35, -297], size: [26, 70, 22], color: 0x2b2750, lowColor: 0xd9c4a0, duskColor: 0x3a2f62, band: { height: 22, color: 0x8d8a96, lowColor: 0xe0a85a, duskColor: 0x6a5a8a } },
    { pos: [-150, 40, -300], size: [30, 80, 20], color: 0x2f2b58, lowColor: 0xb7c3d6, duskColor: 0x40356a },
    { pos: [-30, 18, -340], size: [60, 36, 16], color: 0x342f5e, lowColor: 0xcdb48e, duskColor: 0x4a3e72 },
  ] as LandmarkDef[],

  /** 하늘의 달 (크림색, 안개 무시, 'ps1' 전용. 낮 프리셋에서는 그리지 않는다) */
  moon: { pos: [-120, 120, -380] as Vec3, radius: 14, color: 0xf2e3b8 },
};
