import * as THREE from 'three';
import { DEVICE, PCOL } from '../data/protagonist';
import { VISUAL } from '../config/settings';
import { MeshBuilder, type V3 } from '../render/meshBuilder';
import { createMaterial } from '../render/materials';
import { isPS1 } from '../render/style';

/**
 * 손에 든 휴대 장치: 청록 발광 표시가 있는 검은 태블릿형 소형 장치 (일러스트 DETAILS '휴대 장치').
 * 캐릭터 본체와 분리된 "부착물": 손 부착부(mount)에 group 을 붙이면 된다. group 원점 = 손 중심,
 * 길이 방향 = 로컬 -y (앞 모서리 = 총구), 화면 = -z 쪽(조준 시 위를 본다). 치수·색은 data/protagonist.ts DEVICE.
 * 발사 순간 setGlow(v) 로 청록 표시가 깜빡인다 (평상시에도 idleGlow 만큼 켜져 있다).
 */
export interface HeldDevice {
  readonly group: THREE.Group;
  /** 발사 위치 */
  readonly muzzle: THREE.Object3D;
  /** 돌 던지기 시작 위치 */
  readonly hand: THREE.Object3D;
  /** 청록 발광 0..1 (총구 충전/발사 깜빡임) */
  setGlow(v: number): void;
}

export function createHeldDevice(): HeldDevice {
  const group = new THREE.Group();
  // 본체(검정 3 박스)와 발광부(청록 3 박스)를 각각 하나의 지오메트리로 병합 (드로우콜 2)
  const shade = { exposure: VISUAL.lowpoly.character.exposure, jitter: 0.02, seed: VISUAL.character.look.seed };
  const dark = new MeshBuilder(shade), lit = new MeshBuilder(shade);
  const add = (b: MeshBuilder, spec: { size: V3; pos: V3 }, color: number, ao: readonly [number, number] = [1, 1]) =>
    b.box(spec.size, spec.pos, color, { ao });
  add(dark, DEVICE.body, PCOL.device, [0.8, 1]);
  add(dark, DEVICE.screen, PCOL.deviceScreen);
  add(dark, DEVICE.grip, PCOL.band);
  for (const spec of [DEVICE.strip, DEVICE.dot, DEVICE.emitter]) add(lit, spec, PCOL.cyan);
  group.add(new THREE.Mesh(dark.build(), createMaterial(0xffffff, {
    vertexColors: true, alwaysVertexColors: true, ...(isPS1 ? { emissive: VISUAL.character.look.ps1Emissive } : { selfGlow: VISUAL.lowpoly.character.selfGlow }),
  })));
  // 발광부: 정점색 × 재질 색(어두운 청록) + emissive(청록 × 밝기)
  const cyan = new THREE.Color(PCOL.cyan);
  const glowMat = createMaterial(new THREE.Color(PCOL.cyan).multiplyScalar(0.3).getHex(), { emissive: 0x000000, fog: false });
  const setEmissive = (k: number) => glowMat.emissive.copy(cyan).multiplyScalar(k);
  setEmissive(DEVICE.idleGlow);
  group.add(new THREE.Mesh(lit.build(), glowMat));

  const muzzle = new THREE.Object3D();
  muzzle.position.y = DEVICE.muzzleY;
  group.add(muzzle);
  const hand = new THREE.Object3D();
  hand.position.y = DEVICE.handY;
  group.add(hand);
  return {
    group, muzzle, hand,
    setGlow(v: number) { setEmissive(DEVICE.idleGlow + Math.max(0, Math.min(1.2, v))); },
  };
}
