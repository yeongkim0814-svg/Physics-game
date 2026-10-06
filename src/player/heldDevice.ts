import * as THREE from 'three';
import { COL, lambert } from '../render/palette';

/**
 * 손에 든 휴대 장치(운동량 사출기) 모델. 캐릭터 본체와 분리된 "부착물": 손 부착부(mount)에 group 을 붙이면 된다.
 * 나중에 장치 디자인이 바뀌면 이 파일만 교체. group 원점 = 손 중심, 로컬 -y = 총신 방향.
 */
export interface HeldDevice {
  readonly group: THREE.Group;
  /** 발사 위치 */
  readonly muzzle: THREE.Object3D;
  /** 돌 던지기 시작 위치 */
  readonly hand: THREE.Object3D;
  /** 총구 충전 발광 0..1 */
  setGlow(v: number): void;
}

export function createHeldDevice(): HeldDevice {
  const group = new THREE.Group();
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(x, y, z);
    return m;
  };
  const tipMat = lambert(COL.shade, { emissive: 0x000000, fog: false });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 6), lambert(COL.copper));
  barrel.position.y = -0.38;
  const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), tipMat);
  tip.position.y = -0.62;
  group.add(
    box(0.13, 0.42, 0.15, COL.copperDark, 0, -0.1, 0),
    barrel,
    box(0.1, 0.14, 0.12, COL.shade, 0, 0, 0.12), // 손잡이
    tip,
  );
  const muzzle = new THREE.Object3D();
  muzzle.position.y = -0.68;
  group.add(muzzle);
  const hand = new THREE.Object3D();
  hand.position.y = -0.04;
  group.add(hand);
  return {
    group, muzzle, hand,
    setGlow(v: number) { tipMat.emissive.setHex(COL.amber).multiplyScalar(Math.max(0, Math.min(1.2, v))); },
  };
}
