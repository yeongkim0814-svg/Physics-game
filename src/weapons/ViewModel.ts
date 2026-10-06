import * as THREE from 'three';
import { COL, lambert } from '../render/palette';

/** 1인칭 무기 모델(박스+원기둥). 발사 시 뒤로 튀었다가 복귀 → 반동 피드백. camera 가 scene 에 들어 있어야 보인다 */
export class ViewModel {
  private group = new THREE.Group();
  private kickZ = 0;
  private kickPitch = 0;
  private tip: THREE.MeshLambertMaterial;

  constructor(camera: THREE.Camera) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.5), lambert(COL.copperDark));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.45, 6), lambert(COL.copper));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.4);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.12), lambert(COL.shade));
    grip.position.set(0, -0.15, 0.1);
    // 총구 끝 발광부: 코일 충전량에 따라 밝아진다 (기능색 amber = 에너지)
    this.tip = lambert(COL.shade, { emissive: 0x000000, fog: false });
    const tipMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), this.tip);
    tipMesh.position.set(0, 0.02, -0.66);
    this.group.add(body, barrel, grip, tipMesh);
    this.group.position.set(0.24, -0.22, -0.55);
    camera.add(this.group);
  }

  /** strength: 0~1 정도의 정규화된 반동 세기 */
  kick(strength: number) {
    this.kickZ = Math.min(this.kickZ + 0.14 * strength, 0.3);
    this.kickPitch = Math.min(this.kickPitch + 0.25 * strength, 0.5);
  }

  /** 0..1 충전 발광 */
  setGlow(v: number) {
    this.tip.emissive.setHex(COL.amber).multiplyScalar(Math.max(0, Math.min(1.2, v)));
  }

  update(dt: number) {
    const k = Math.exp(-14 * dt);
    this.kickZ *= k;
    this.kickPitch *= k;
    this.group.position.z = -0.55 + this.kickZ;
    this.group.rotation.x = this.kickPitch;
  }
}
