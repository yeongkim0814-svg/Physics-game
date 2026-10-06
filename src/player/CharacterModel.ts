import type * as THREE from 'three';
import { placeholderCharacter } from './placeholderCharacter';

/** 캐릭터가 매 프레임 받는 상태. 모델은 이것만 보고 자세를 정한다 */
export interface CharacterState {
  /** 수평 속력 (m/s) */
  speed: number;
  grounded: boolean;
  /** 조준/발사 자세인가 (카메라 yaw 쪽으로 몸이 정렬된 상태) */
  aiming: boolean;
  /** 수직 속도 (m/s, 위쪽 +). 낙하 자세용 */
  vy: number;
  /** 카메라 pitch (rad, 위쪽 +). 조준 시 무기를 든 팔의 각도용 */
  aimPitch: number;
}

/**
 * 교체 가능한 캐릭터 모델 계약. 사용자가 캐릭터 디자인을 주면 이 인터페이스의 새 구현체를 만들고
 * 아래 createPlayerCharacter 가 그것을 돌려주게 바꾸면 된다 (다른 코드는 수정 불필요).
 *
 * 규약: root 원점 = 발바닥 중앙, 정면 = -z, 키 ≈ TUNING.player.height(1.8m). 재질은 render/palette 의 lambert().
 * root 의 위치/회전(yaw)은 PlayerAvatar 가 정한다 — 구현체는 root 아래만 움직인다.
 */
export interface CharacterModel {
  readonly root: THREE.Object3D;
  /** 총구: 무기 발사 위치(월드 좌표는 getWorldPosition 으로 읽는다) */
  readonly muzzle: THREE.Object3D;
  /** 손: 돌 던지기 시작 위치 */
  readonly hand: THREE.Object3D;
  update(dt: number, state: CharacterState): void;
  /** (선택) 발사 반동 연출. strength 0~1.5 */
  kick?(strength: number): void;
  /** (선택) 총구 충전 발광 0..1 */
  setGlow?(v: number): void;
}

/** 교체 지점: 새 캐릭터 구현체가 생기면 여기서 그것을 반환하게 바꾼다 */
export function createPlayerCharacter(): CharacterModel {
  return placeholderCharacter();
}
