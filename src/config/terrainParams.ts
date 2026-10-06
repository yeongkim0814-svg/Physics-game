// 계단형 하이트필드 지형 수치 (A2, world/terrain/*). 길이는 m. 알고리즘·튜닝법은 docs/TERRAIN.md.
// 레이아웃(패드·둔덕·램프·메사)은 data/map.ts 의 MAP.terrain, 여기는 노이즈·LOD·타일·충돌 상한 같은 생성 수치만 둔다.
import type { TerrainParams } from '../world/terrain/terrainField';

export const TERRAIN_FIELD: TerrainParams = {
  seed: 7,
  stepH: 3,        // 층 높이 (1.6~3m 범위에서 튜닝: 클수록 절벽이 거칠고 삼각형이 적다). 협곡 14m·고원 0m 는 패드/카빙이 정확히 지정
  fineStep: 0.2,   // 램프·계단 미세 단위 (자동 계단 한계 0.5m 이하, 층 높이 3m·협곡 14m 의 약수)
  plateau: { half: 82, wobble: 14, wobbleScale: 70 },
  rim: { widthMin: 14, widthMax: 46, scale: 110, rough: 1.6 },
  valley: { depthMin: 24, depthMax: 40, scale: 260, floorNoise: 4, floorNoiseScale: 70 },
  tier: { height: 9, sharp: 2.6, fadeIn: 8 }, // 선반 간격 9m = stepH 의 3배 (고원 0, 계곡 바닥 -27/-36 …)
  massif: { warpScale: 60, warpAmp: 14, sharpMin: 0.18, sharpMax: 0.5, topNoise: 1.5 },
  mountain: { r0: 250, r1: 430, base: 30, amp: 70, scale: 150, octaves: 4, dip: { azimuthDeg: 170, halfWidthDeg: 38, min: 0.35 } },
  bluff: { slope: 1, edgeNoise: 2.5 },
  canyonMouth: { length: 30, slope: 0.5 },
  // 근거리 = 고해상도(셀 2m, 플레이 영역+고원 가장자리·절벽), 원거리 = 저해상도 링(셀 24m, 카메라 far 500 너머까지). nearHalf 는 farCell·nearCell 의 배수
  lod: { nearHalf: 120, nearCell: 2, farHalf: 528, farCell: 24, farStepH: 9, farRadius: 520 },
};

/** 지형 메시: 타일(색 모자이크) 한 변 길이(m)와 면당 상한. 면 크기에 비례, 원점에서 멀수록 (r/r0)^grow 배로 키워 적응형으로 쪼갠다 */
export const TERRAIN_MESH = {
  seed: 29,
  tile: { top: 4, wall: 4, max: 48, r0: 90, grow: 3 },
  maxTiles: 24,
  /** 높이별 윗면 팔레트: [이 높이 이상이면 해당 팔레트] (위에서부터 검사) */
  topPalette: [{ minY: -1, palette: 'earth' }, { minY: 5, palette: 'rock' }, { minY: -1000, palette: 'cliff' }] as const,
};

/** 충돌: 외곽 벽 안쪽(+여유)만 정적 trimesh (원거리 링은 시각 전용). 삼각형 상한은 Rapier 성능 보호용 (단위 테스트가 검사) */
export const TERRAIN_COLLISION = { half: 86, maxTriangles: 4000 };
