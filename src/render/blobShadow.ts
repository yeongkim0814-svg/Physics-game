import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import { VISUAL } from '../config/settings';

/**
 * 발밑 블롭 그림자 (3인칭 가독성용, 'lowpoly'): 발 아래 지면으로 레이를 쏴 그 위에 반투명 원을 깐다.
 * 공중에서는 높이에 따라 작고 옅어져 착지 위치를 읽게 해 준다. 실시간 그림자는 쓰지 않는다.
 */
export class BlobShadow {
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, private world: RAPIER.World, private exclude: RAPIER.RigidBody) {
    const B = VISUAL.lowpoly.blob;
    this.mat = new THREE.MeshBasicMaterial({ color: B.color, transparent: true, opacity: B.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(B.radius, 14).rotateX(-Math.PI / 2), this.mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** feet = 발 위치 */
  update(feet: THREE.Vector3) {
    const B = VISUAL.lowpoly.blob;
    const lift = 0.3;
    const ray = new RAPIER.Ray({ x: feet.x, y: feet.y + lift, z: feet.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, B.maxDrop, true, undefined, undefined, undefined, this.exclude);
    if (!hit) { this.mesh.visible = false; return; }
    const drop = Math.max(0, hit.timeOfImpact - lift); // 발에서 지면까지 높이
    const k = Math.min(1, drop / B.fadeHeight);
    this.mesh.visible = true;
    this.mesh.position.set(feet.x, feet.y + lift - hit.timeOfImpact + 0.03, feet.z);
    this.mesh.scale.setScalar(1 - (1 - B.minScale) * k);
    this.mat.opacity = B.opacity * (1 - 0.7 * k);
  }
}
