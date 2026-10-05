import * as THREE from 'three';
import { COL, CUES, lambert } from '../render/palette';

/** 탈출 지점: 안개를 무시하는 초록 기둥(원거리 표식) + 바닥 링. 반경 안에 들어가면 도달 */
export class Extraction {
  readonly position: THREE.Vector3;
  private ring: THREE.Mesh;
  private t = 0;

  constructor(scene: THREE.Scene, pos: [number, number, number], readonly radius: number) {
    this.position = new THREE.Vector3(...pos);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 30, 6),
      lambert(COL.oliveDark, { emissive: CUES.exit, fog: false }),
    );
    pillar.position.set(pos[0], 15, pos[2]);
    this.ring = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.15, 16),
      lambert(COL.oliveDark, { emissive: CUES.exit, fog: false }),
    );
    this.ring.position.set(pos[0], 0.08, pos[2]);
    scene.add(pillar, this.ring);
  }

  contains(p: THREE.Vector3) {
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    return dx * dx + dz * dz <= this.radius * this.radius && Math.abs(p.y - this.position.y) < 4;
  }

  update(dt: number) {
    this.t += dt;
    this.ring.scale.setScalar(1 + Math.sin(this.t * 3) * 0.04);
  }
}
