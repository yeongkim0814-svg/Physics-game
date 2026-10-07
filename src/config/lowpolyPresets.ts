// 'lowpoly' 스타일의 시간대 프리셋 수치 (VISUAL.lowpoly.presets 로 노출). 'day' = M1g 낮빛(보관), 'dusk' = M1i 황혼 블록 룩(기본).
// 길이는 m, 색은 0xRRGGBB. 목표 이미지(docs/reference/world_target.jpg)에서 샘플링한 값에 맞춘다.
// 순수 수치만 둔다 (three 의존 없음).

export type Vec3T = [number, number, number];

/**
 * 셰이더 높이 안개 (render/materials.ts 공용 패치, 월드 y 기반): 밀도 ρ(y) = density·exp(-(y - top)/falloff) 를 카메라→프래그먼트 선분으로 적분한다.
 * top 은 밀도가 density 인 높이(m), falloff 는 e 배 변하는 높이 간격. 낮은 곳일수록 짙고 color(보랏빛)로 잠긴다. density 0 이면 꺼짐.
 */
export interface HeightFog { top: number; falloff: number; density: number; color: number }

export interface LowpolyPreset {
  /** 안개 = 배경색. 백드롭 하단·지평선 헤이즈와 맞춘다 */
  fog: { color: number; near: number; far: number; height?: HeightFog };
  /** 태양광(Directional) + 하늘/지면 반사광(Hemisphere). 강도는 three 물리 단위(≈π 배) */
  lighting: { sky: number; ground: number; hemiIntensity: number; sun: number; sunIntensity: number; sunDir: Vec3T; sunDistance: number };
  sky: {
    radius: number; rings: number; segments: number;
    zenith: number; mid: number; horizon: number;
    /** 지평선과 중간 사이의 추가 색 (있으면 4단 그라디언트) */
    low?: number;
    gradientPower: number;
    /** 태양 방위 번짐: dot(방향, 해)^power × amount 만큼 color 쪽으로 섞는다 (여러 겹) */
    glow: { color: number; power: number; amount: number }[];
    sun: { distance: number; radius: number; color: number; haloColor: number; haloScales: number[]; haloOpacity: number; dir?: Vec3T };
    clouds: {
      mode: 'puffs' | 'bands';
      count: number; parts: [number, number]; distance: number; size: [number, number];
      squash: number; elevMin: number; elevMax: number;
      color: number; shade: number; drift: number;
      /** bands 모드: 띠 색 후보와 가로 늘림 배율 */
      bandColors: number[]; bandStretch: number;
    };
  };
  /** 지형 모자이크 룩 (render/../world/blockTerrain.ts) */
  terrain: {
    palettes: { rock: number[]; earth: number[]; cliff: number[]; moss: number[] };
    lightAmp: number;     // 타일 명도 ± 비율
    hueMix: number;       // 타일이 이웃 팔레트색 쪽으로 섞이는 최대 비율 (색조 이동)
    mossTop: number;      // 윗면 타일이 이끼색과 섞일 확률
    mossSide: number;     // 측면 타일의 이끼 확률 (적게)
    mossStrength: [number, number]; // 이끼 혼합 비율 범위
    bottomShade: number;  // 측면 밑동의 명도 배율 (1 = 그라디언트 없음)
    shadeHeight: number;  // 밑동에서 이 높이(m)까지 그라디언트
    /** 하이트필드 색 보정 (world/terrain/terrainMesh.ts): 낮은 곳일수록 어둡고 depthTint.color 쪽으로, 먼 링은 farTint.color(원경 산 색)로 수렴 */
    depthTint: { color: number; amount: number; depth: number; darken: number; wall: number };
    farTint: { color: number; from: number; to: number; amount: number };
  };
  character: { exposure: number; selfGlow: Vec3T; rim: { color: number; strength: number; power: number } };
  blob: { radius: number; opacity: number; color: number; maxDrop: number; minScale: number; fadeHeight: number };
  decor: {
    seed: number; trees: number; rocks: number; mossPatches: number; puddles: number;
    treeRange: [number, number];
    mossColor: number; mossColor2: number; puddleColor: number;
    treeCrown: number; treeCrown2: number; treeTrunk: number;
    rock: number;
  };
  /** 시대별 기능 켜기/끄기 */
  features: { backdrop: boolean; beam: boolean; debris: boolean; windows: boolean; ledges: boolean };
  /** 떠 있는 파편 색 후보 */
  debrisColors: number[];
  /** 기술 모듈(기둥·아치·벽·링) 인스턴스 색 후보 (G5) */
  techColors: number[];
  /** 빛기둥 색: 중심(밝음)·바깥 번짐 */
  beamColors: { core: number; outer: number };
}

export const LP_DAY: LowpolyPreset = {
  // 낮: 계곡 바닥에만 옅은 청백색 아지랑이 (안전 기본값)
  fog: { color: 0xcfe7f5, near: 40, far: 400, height: { top: -8, falloff: 22, density: 0.0012, color: 0xbcd6ee } },
  lighting: {
    sky: 0x93bcff, ground: 0xa0b0e6, hemiIntensity: 2.3,
    sun: 0xfff1d2, sunIntensity: 2.6, sunDir: [0.45, 0.7, 0.55], sunDistance: 40,
  },
  sky: {
    radius: 400, rings: 32, segments: 24,
    zenith: 0x2f7fe4, mid: 0x74b8f4, horizon: 0xcfe7f5,
    gradientPower: 0.75,
    glow: [],
    sun: { distance: 380, radius: 18, color: 0xfffbe6, haloColor: 0xffffff, haloScales: [1.7, 2.6, 3.8], haloOpacity: 0.18 },
    clouds: {
      mode: 'puffs', count: 9, parts: [3, 5], distance: 300, size: [26, 48],
      squash: 0.4, elevMin: 0.2, elevMax: 0.62,
      color: 0xffffff, shade: 0x4a5878, drift: 0.004,
      bandColors: [], bandStretch: 1,
    },
  },
  terrain: {
    palettes: {
      rock: [0xecca94, 0xf0d8aa, 0xe2bd88, 0xe8cfa0],
      earth: [0xe8b866, 0xe2b06a, 0xecc07a],
      cliff: [0xd9b88a, 0xcaa77e, 0xe0c096],
      moss: [0x8bb36a, 0xa9bb62],
    },
    lightAmp: 0.07, hueMix: 0.15, mossTop: 0.1, mossSide: 0, mossStrength: [0.4, 0.7],
    bottomShade: 0.72, shadeHeight: 5,
    depthTint: { color: 0xa8c4de, amount: 0.3, depth: 40, darken: 0.12, wall: 0.95 },
    farTint: { color: 0xb8d4ea, from: 160, to: 420, amount: 0.4 },
  },
  character: { exposure: 0.72, selfGlow: [0.55, 0.44, 0.3], rim: { color: 0xcfe6ff, strength: 0.34, power: 3.2 } },
  blob: { radius: 0.5, opacity: 0.32, color: 0x24324d, maxDrop: 40, minScale: 0.45, fadeHeight: 12 },
  decor: {
    seed: 5, trees: 150, rocks: 60, mossPatches: 70, puddles: 12,
    treeRange: [92, 460],
    mossColor: 0x8bb36a, mossColor2: 0xa9bb62, puddleColor: 0x46a89a,
    treeCrown: 0x6fa860, treeCrown2: 0x93b255, treeTrunk: 0x8a6244,
    rock: 0xc9b9a2,
  },
  features: { backdrop: false, beam: false, debris: false, windows: false, ledges: false },
  debrisColors: [0xd9c4a0],
  techColors: [0xc9b9a2, 0xb7c3d6, 0xd9c4a0],
  beamColors: { core: 0xffffff, outer: 0xcfe7f5 },
};

export const LP_DUSK: LowpolyPreset = {
  // 영원한 황혼: 안개는 목표 이미지 중경 계곡의 보랏빛 헤이즈. 가까운 곳은 선명, 멀수록 라일락으로 잠긴다
  // 높이 안개(C6): 계곡 바닥(-30m 부근)은 짙은 보라 안개 속에 잠기고, 고원(y≥0)은 선명하다
  fog: { color: 0x7360a2, near: 45, far: 320, height: { top: -6, falloff: 13, density: 0.016, color: 0x6a68a6 } },
  lighting: {
    // 하늘 반사광은 보라(그늘면), 지면 반사는 따뜻한 갈색. 태양은 낮은 고도에서 호박색 측면광 (햇빛 면 = 호박 림)
    sky: 0x8468b4, ground: 0xb07a60, hemiIntensity: 3.5,
    sun: 0xffa24e, sunIntensity: 3.7, sunDir: [0.55, 0.45, -0.7], sunDistance: 40,
  },
  sky: {
    radius: 400, rings: 48, segments: 72,
    zenith: 0x4a3f8f, mid: 0x8a6bb5, low: 0xdc7f9a, horizon: 0xf6a85e,
    gradientPower: 0.6,
    glow: [
      { color: 0xffd27a, power: 14, amount: 0.95 },
      { color: 0xffa070, power: 3, amount: 0.4 },
    ],
    // 해 원반 방향: 지평선 위 약 8도, 스폰에서 북(-z)을 볼 때 오른쪽 앞 (backdrop.sunAzimuthDeg 와 일치)
    sun: { distance: 380, radius: 13, color: 0xfff0a8, haloColor: 0xffd27a, haloScales: [1.8, 3, 5.2], haloOpacity: 0.2, dir: [0.6, 0.15, -0.79] },
    clouds: {
      mode: 'bands', count: 12, parts: [6, 9], distance: 320, size: [16, 28],
      squash: 0.12, elevMin: 0.1, elevMax: 0.52,
      color: 0xffffff, shade: 0x000000, drift: 0.0016,
      bandColors: [0x6a5aa0, 0x8a6aae, 0xc4789e, 0xe88a9c, 0xf6a070], bandStretch: 2.6,
    },
  },
  terrain: {
    palettes: {
      // 갈색·구리·적갈색 암석 + 남보라 석재. 햇빛은 호박 림, 그늘은 보랏빛이 만든다
      rock: [0xa87058, 0x946054, 0xb87c5a, 0x805c68, 0x946a72, 0x705a78, 0xc08a60],
      earth: [0x8c5c38, 0x7a5236, 0x9c6a3c, 0x6e4a38, 0x84583c],
      cliff: [0x846070, 0x705a7c, 0x946a74, 0x625480, 0x886470, 0xa07468],
      moss: [0x6b7a2e, 0x84883a, 0x5a6b34, 0x9a9a44],
    },
    lightAmp: 0.22, hueMix: 0.3, mossTop: 0.2, mossSide: 0.035, mossStrength: [0.5, 0.95],
    bottomShade: 0.62, shadeHeight: 6,
    depthTint: { color: 0x3a3f72, amount: 0.5, depth: 38, darken: 0.4, wall: 0.72 },
    farTint: { color: 0x5a4a8c, from: 160, to: 420, amount: 0.45 },
  },
  // 림은 호박색 태양 쪽 역광 (스폰에서 북쪽을 볼 때 해가 앞쪽이라 캐릭터 가장자리가 호박색으로 빛난다)
  character: { exposure: 0.8, selfGlow: [0.45, 0.3, 0.24], rim: { color: 0xffb066, strength: 0.62, power: 2.6 } },
  blob: { radius: 0.5, opacity: 0.4, color: 0x251c44, maxDrop: 40, minScale: 0.45, fadeHeight: 12 },
  decor: {
    // 맵 밖 평원 장식은 백드롭과 겹치므로 줄이고 올리브·황록 관목으로
    seed: 5, trees: 46, rocks: 22, mossPatches: 80, puddles: 10,
    treeRange: [92, 230],
    mossColor: 0x6b7a2e, mossColor2: 0x84883a, puddleColor: 0x3e4f86,
    treeCrown: 0x3e4a20, treeCrown2: 0x586028, treeTrunk: 0x5a3e34,
    rock: 0x7a5a5a,
  },
  features: { backdrop: true, beam: true, debris: true, windows: true, ledges: true },
  debrisColors: [0x4e4270, 0x5e4a72, 0x6e5060, 0x7a5a58, 0x463c68, 0x8a6a5a],
  techColors: [0x2c2640, 0x342c4c, 0x262338, 0x3e3050],
  beamColors: { core: 0xe6e0ff, outer: 0x8c7cff },
};
