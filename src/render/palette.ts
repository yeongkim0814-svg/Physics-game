import * as THREE from 'three';
import { patchRetro } from './snap';

// 색을 코드에서 쓴 그대로 출력 (후처리 색 계산 단순화). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** 환경 팔레트 (GAME_DESIGN 14절): 청회색 석재 + 구리색 금속 + 따뜻한 모래, 그림자는 차가운 남색 */
export const COL = {
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

/** 하늘 그라디언트 (위 → 지평선). 지평선 색은 VISUAL.fog.color 와 맞춘다 */
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

export interface LambertOpts {
  map?: THREE.Texture;
  /** 가독성 단서용 발광색 (CUES) */
  emissive?: number;
  /** 발광 텍스처 (하늘돔 등: 조명 영향 없이 텍스처 색 그대로) */
  emissiveMap?: THREE.Texture;
  /** false 면 안개 무시(탈출 지점 표식 등 원거리에서도 보여야 하는 것) */
  fog?: boolean;
}

/** 모든 메시의 기본 재질: Lambert + flatShading + 정점 스냅 */
export function lambert(color: number, o: LambertOpts = {}) {
  const m = new THREE.MeshLambertMaterial({
    color, flatShading: true, emissive: o.emissive ?? 0x000000, fog: o.fog ?? true,
    ...(o.map ? { map: o.map } : {}), // map: undefined 를 넘기면 three 가 경고한다
    ...(o.emissiveMap ? { emissiveMap: o.emissiveMap } : {}),
  });
  patchRetro(m);
  return m;
}
