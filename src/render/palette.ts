import * as THREE from 'three';
import { isPS1 } from './style';

// 색을 코드에서 쓴 그대로 출력 (후처리 색 계산 단순화). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** 이전 PS1풍 팔레트 (GAME_DESIGN 14-1, 보관): 청회색 석재 + 구리색 금속 + 따뜻한 모래, 그림자는 차가운 남색 */
const COL_PS1 = {
  stone: 0x7f95b2,       // 청회색 석재 (건물·벽)
  stoneLight: 0xa9bdd2,  // 벽돌 윗면 하이라이트 / 밝은 벽돌
  stoneDark: 0x5c7391,   // 어두운 벽돌 / 그늘진 석재
  moss: 0x5b8a68,        // 이끼 (청록 쪽 초록. 기능색 green 과 구분되는 탁한 색)
  verdigris: 0x58968c,   // 구리 녹청
  cream: 0xf2e3b8,       // 크림 (달, 목도리, 장식)
  dust: 0xe3c08f,        // 밝은 모래/먼지
  sandDark: 0xa9835f,    // 어두운 모래/자갈
  shade: 0x39435c,       // 차가운 그늘 / 어두운 부품
  copperDark: 0x6b3f2c,  // 어두운 구리
  copper: 0xd9915a,      // 밝은 구리 (리벳·금속 하이라이트)
  grout: 0x3c3650,       // 줄눈·그레인 (남보라)
  sand: 0xc9a47a,        // 햇볕에 마른 바닥 (따뜻한 색)
  // ⚠️ 기능색: 게임 규칙과 직결, 변경 금지
  cyan: 0x6fc4c0,       // 전도체 (금속 구조물·금속 몹·물웅덩이)
  amber: 0xd89a2e,      // 에너지 (전기 연쇄·충전)
  green: 0x7fbf6a,      // 탈출 지점 / 건강
  red: 0xc0452e,        // 위험 / 적 / 체력 부족
} as const;

/**
 * 로우폴리(BotW 풍 밝은 낮) 팔레트 (GAME_DESIGN 14절): 모래·황토 베이지 지면, 따뜻한 크림/살구 석재(그늘면은 조명이 청회색으로 만든다),
 * 구리/황동 금속, 이끼 초록·청록 포인트. 알베도는 밝은 낮빛에서 날아가지 않게 순백보다 한 단계 낮춘다. 키 이름은 PS1 팔레트와 같다.
 */
const COL_LOWPOLY: { [K in keyof typeof COL_PS1]: number } = {
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
  cyan: COL_PS1.cyan,
  amber: COL_PS1.amber,
  green: COL_PS1.green,
  red: COL_PS1.red,
};

/** 현재 스타일의 환경 팔레트 */
export const COL: { [K in keyof typeof COL_PS1]: number } = isPS1 ? COL_PS1 : COL_LOWPOLY;

/** 낮 하늘(로우폴리) 색은 settings.ts VISUAL.lowpoly.sky 에 있다 */
/** PS1 노을 하늘 그라디언트 (위 → 지평선). 지평선 색은 VISUAL.fog.color 와 맞춘다 */
export const SKY = {
  zenith: 0x1a1640,   // 짙은 남보라
  high: 0x2e2866,
  mid: 0x6a4f94,      // 보랏빛
  low: 0xb5698f,      // 노을 장밋빛
  horizon: 0xf0a05a,  // 호박
  cloud: 0x7d62a8,    // 보랏빛 구름
  star: 0xf2e3b8,
} as const;

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
