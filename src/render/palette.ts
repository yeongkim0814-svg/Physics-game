import * as THREE from 'three';
import { TOD } from './style';

// 색을 코드에서 쓴 그대로 출력 (후처리 색 계산 단순화). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** ⚠️ 기능색: 게임 규칙과 직결, 변경 금지 (모든 팔레트 동일) */
const FN = {
  cyan: 0x6fc4c0,  // 전도체 (금속 구조물·금속 몹·물웅덩이)
  amber: 0xd89a2e, // 에너지 (전기 연쇄·충전)
  green: 0x7fbf6a, // 탈출 지점 / 건강
  red: 0xc0452e,   // 위험 / 적 / 체력 부족
} as const;

interface Palette {
  stone: number; stoneLight: number; stoneDark: number; moss: number; verdigris: number; cream: number; dust: number;
  sandDark: number; shade: number; copperDark: number; copper: number; grout: number; sand: number;
  cyan: number; amber: number; green: number; red: number;
}

/**
 * 로우폴리(BotW 풍 밝은 낮) 팔레트 (GAME_DESIGN 14절): 모래·황토 베이지 지면, 따뜻한 크림/살구 석재(그늘면은 조명이 청회색으로 만든다),
 * 구리/황동 금속, 이끼 초록·청록 포인트. 알베도는 밝은 낮빛에서 날아가지 않게 순백보다 한 단계 낮춘다.
 */
const COL_LOWPOLY: Palette = {
  stone: 0xecca94,       // 크림/살구 석재 (건물·벽)
  stoneLight: 0xf3e2c2,  // 밝은 석재
  stoneDark: 0x8fa3c0,   // 청회색 석재 (그늘진·낡은 석재)
  moss: 0x6fa860,        // 이끼 초록
  verdigris: 0x4fa598,   // 구리 녹청 (청록)
  cream: 0xf4e6c0,       // 크림 (목도리, 셔츠, 장식)
  dust: 0xecc48a,        // 밝은 모래/먼지
  sandDark: 0xb98f63,    // 어두운 모래/자갈
  shade: 0x55627d,       // 차가운 그늘 / 어두운 부품
  copperDark: 0x8a4f32,  // 어두운 구리
  copper: 0xe0974f,      // 밝은 구리·황동
  grout: 0x6f6a85,       // 줄눈·그레인
  sand: 0xe8b866,        // 햇볕에 마른 바닥 (모래·황토 베이지)
  // ⚠️ 기능색: 게임 규칙과 직결, 변경 금지 (두 팔레트 동일)
  cyan: FN.cyan,
  amber: FN.amber,
  green: FN.green,
  red: FN.red,
};

/**
 * 로우폴리 황혼 팔레트 (M1i, 목표 이미지): 갈색·구리·적갈색 암석, 남보라 그늘, 올리브 이끼. 알베도는 호박 햇빛(×3.7)에 날아가지 않게 어둡게.
 * 기능색(cyan/amber/green/red)은 모든 팔레트에서 동일.
 */
const COL_DUSK: Palette = {
  stone: 0x8a6458,
  stoneLight: 0xa88068,
  stoneDark: 0x5e4a62,
  moss: 0x6b7a2e,
  verdigris: 0x4a8a84,
  cream: 0xe6d8c0,
  dust: 0xb08a68,
  sandDark: 0x7a5a42,
  shade: 0x3a3258,
  copperDark: 0x6a3e30,
  copper: 0xc0804c,
  grout: 0x4a4066,
  sand: 0x8c6444,
  cyan: FN.cyan,
  amber: FN.amber,
  green: FN.green,
  red: FN.red,
};

/** 현재 스타일의 환경 팔레트 */
export const COL: Palette = TOD === 'dusk' ? COL_DUSK : COL_LOWPOLY;

/** 게임 의미 → 기능색 */
export const CUES = {
  conductor: COL.cyan,
  electric: COL.amber,
  exit: COL.green,
  enemy: COL.red,
  hazard: COL.red,
} as const;

/** 재질 생성은 render/materials.ts 의 createMaterial 로 통일. 기존 이름 lambert 는 alias 로 유지한다 */
export { createMaterial, createMaterial as lambert } from './materials';
export type { MaterialOpts, MaterialOpts as LambertOpts } from './materials';
