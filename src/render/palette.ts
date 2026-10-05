import * as THREE from 'three';
import { patchRetro } from './snap';

// 색을 코드에서 쓴 그대로 출력 (후처리 색 계산 단순화). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** 배경 톤(올리브/카키)은 자유롭게 조정 가능 */
export const COL = {
  oliveMid: 0x59603f,   // 주요 벽색
  oliveDark: 0x363d2a,  // 그림자/내부
  steelDark: 0x2c2e29,  // 어두운 금속
  aluminum: 0x8c8f82,   // 밝은 금속
  grout: 0x2e3228,      // 그레인 라인
  floorTile: 0x7b816b,  // 타일
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
    color, map: o.map, flatShading: true, emissive: o.emissive ?? 0x000000, fog: o.fog ?? true,
  });
  patchRetro(m);
  return m;
}
