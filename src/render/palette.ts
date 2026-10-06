import * as THREE from 'three';
import { patchRetro } from './snap';

// 색을 코드에서 쓴 그대로 출력 (후처리 색 계산 단순화). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** 환경 팔레트 (GAME_DESIGN 14절): 청회색 석재 + 구리색 금속 + 따뜻한 모래, 그림자는 차가운 남색 */
export const COL = {
  stone: 0x7f95b2,       // 청회색 석재 (건물·벽)
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
  /** false 면 안개 무시(탈출 지점 표식 등 원거리에서도 보여야 하는 것) */
  fog?: boolean;
}

/** 모든 메시의 기본 재질: Lambert + flatShading + 정점 스냅 */
export function lambert(color: number, o: LambertOpts = {}) {
  const m = new THREE.MeshLambertMaterial({
    color, flatShading: true, emissive: o.emissive ?? 0x000000, fog: o.fog ?? true,
    ...(o.map ? { map: o.map } : {}), // map: undefined 를 넘기면 three 가 경고한다
  });
  patchRetro(m);
  return m;
}
