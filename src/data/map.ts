import type { MobKind } from '../core/types';
import { canyonLedges, terraceBlocks, type StairDef, type TerraceDef, type Vec3 } from '../world/mapGen';
import type { BluffDef, MassifDef, RampDef, TerrainPad } from '../world/terrain/terrainField';

/**
 * 말라붙은 해안 도시 일부 (GAME_DESIGN 9절). 단위 m, 좌표 x/z 는 맵 중심 기준, 지면 윗면 y=0.
 * 레이아웃은 코드 수정 없이 여기서 바꾼다. 월드 빌더(world/GameWorld.ts)가 읽는다.
 *
 * 구역(북쪽이 -z): 남쪽 스폰 평지 → 폐허 건물 블록 → 동서로 가로지르는 물 빠진 협곡(다리 잔해·계단) → 북쪽 높은 탑
 */
export type BlockKind = 'concrete' | 'metal';
/** look = 황혼 블록 지형의 팔레트 (기본 rock). moss = 이끼 확률 배율 */
export interface BlockDef { pos: Vec3; size: Vec3; kind: BlockKind; look?: 'rock' | 'earth' | 'cliff'; moss?: number }
export interface StairMapDef extends StairDef { kind: BlockKind }
export interface WaterDef { center: [number, number]; size: [number, number] }
export interface MobSpawnDef { kind: MobKind; pos: [number, number, number] }

const C = (pos: Vec3, size: Vec3): BlockDef => ({ pos, size, kind: 'concrete' });

// --- 협곡 (x 방향으로 맵 전체를 가로지른다) ---
const HALF = 80;            // 맵 반 변 길이
const CANYON = { zMin: -18, zMax: -4, depth: 14 };

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

/**
 * A2 계단형 하이트필드 지형 레이아웃 (생성기: world/terrain/terrainField.ts, 수치: config/terrainParams.ts, 설명: docs/TERRAIN.md).
 * 플레이 영역은 평탄한 고원(y=0, 반폭 ≈ 82m = 외곽 벽 바로 뒤)이고, 그 바깥은 계곡 → 메사 → 산맥으로 떨어진다. 고원 바깥은 충돌 벽 너머라 시각 전용.
 * 평탄 패드·램프는 노이즈·둔덕보다 우선한다 (협곡 카빙은 패드보다도 우선).
 */
const TERRAIN_PADS: TerrainPad[] = [
  { id: 'spawn', center: [0, 52], radius: 18, y: 0, blend: 8, note: '스폰 평지' },
  { id: 'twinDrop', center: [T.x, T.z - 6], radius: 40, y: 0, blend: 14, note: '쌍둥이 낙하 구역 용지: 탑 밑동을 품은 반경 40m 평탄 패드 (협곡 북쪽 가장자리 z=-18 에 접하도록 탑 중심에서 6m 북쪽) — 다음 게임플레이 작업 (b)' },
];
/** 고원 둔덕 (계단 절벽 전경용, top 은 층 높이 3m 의 배수). 오를 수 없는 3m 층 단차라서 걸어서 오르는 길은 RAMPS 가 만든다 */
const TERRAIN_BLUFFS: BluffDef[] = [
  { center: [68, 71], size: [24, 18], top: 6 },
  { center: [-68, 70], size: [24, 20], top: 9 },
  { center: [70, -66], size: [20, 24], top: 6 },
];
/** 램프 회랑: 경사 ≤ 0.18 (2m 칸당 ≤ 0.36m < 자동 계단 한계 0.5m). 끝은 둔덕 윗면 안쪽까지. 둔덕 윗면까지 걸어서 오른다 */
const TERRAIN_RAMPS: RampDef[] = [
  { from: [26, 70], to: [70, 70], width: 6, y0: 0, y1: 6 },
  { from: [66, -30], to: [66, -64], width: 6, y0: 0, y1: 6 },
];
/** 계곡에서 솟는 메사 (옛 시각 전용 박스 메사를 대체). top 은 고원 윗면 기준 m */
const TERRAIN_MASSIFS: MassifDef[] = [
  { center: [-20, -190], radius: 55, top: 9, seed: 201 },
  { center: [60, -235], radius: 70, top: 27, seed: 202 },
  { center: [-125, -215], radius: 60, top: 18, seed: 203 },
  { center: [150, -150], radius: 65, top: 18, seed: 204 },
  { center: [205, -55], radius: 55, top: 9, seed: 205 },
  { center: [175, 25], radius: 48, top: 9, seed: 206 },
  { center: [170, 125], radius: 60, top: 18, seed: 207 },
  { center: [110, 200], radius: 70, top: 27, seed: 208 },
  { center: [-10, 190], radius: 55, top: 9, seed: 209 },
  { center: [-140, 180], radius: 65, top: 18, seed: 210 },
  { center: [-190, 60], radius: 60, top: 18, seed: 211 },
  { center: [-175, -45], radius: 45, top: 9, seed: 212 },
  { center: [-210, -135], radius: 75, top: 27, seed: 213 },
  { center: [-135, -20], radius: 24, top: 9, seed: 214 },
  { center: [128, -128], radius: 22, top: 9, seed: 215 },
  { center: [40, -140], radius: 26, top: 18, seed: 216 },
  { center: [-100, -135], radius: 20, top: 9, seed: 217 },
  // 고립 암주(spire): 반경 10~14m 의 가는 기둥. 계곡에서 고원보다 높이 솟아 중거리 실루엣에 수직 리듬을 준다
  { center: [-100, -170], radius: 12, top: 36, seed: 221 },
  { center: [-52, -215], radius: 11, top: 45, seed: 222 },
  { center: [95, -165], radius: 13, top: 27, seed: 223 },
  { center: [150, -110], radius: 12, top: 45, seed: 224 },
  { center: [-165, -95], radius: 11, top: 36, seed: 225 },
  { center: [-150, 45], radius: 12, top: 27, seed: 226 },
  { center: [140, 75], radius: 11, top: 36, seed: 227 },
  { center: [45, 160], radius: 13, top: 27, seed: 228 },
  { center: [-85, 150], radius: 10, top: 36, seed: 229 },
  { center: [110, -215], radius: 14, top: 45, seed: 230 },
];

export const MAP = {
  /** 한 변 길이. 외곽은 보이지 않는 충돌 벽(지평선을 가리지 않음) */
  size: HALF * 2,
  wallHeight: 80,
  spawn: [0, 0.2, 52] as Vec3,

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

  /** 협곡 (x 방향으로 맵 전체를 가로지른다). 하이트필드가 같은 값으로 카빙한다 */
  canyon: CANYON,

  /** A2 하이트필드 지형 레이아웃 (패드·둔덕·램프·메사) */
  terrain: { pads: TERRAIN_PADS, bluffs: TERRAIN_BLUFFS, ramps: TERRAIN_RAMPS, massifs: TERRAIN_MASSIFS },

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
};
