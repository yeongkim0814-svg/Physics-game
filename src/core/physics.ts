import RAPIER from '@dimforge/rapier3d-compat';
import { TUNING } from '../config/tuning';

export { RAPIER };

export async function createPhysics() {
  await RAPIER.init();
  return new RAPIER.World({ x: 0, y: -TUNING.world.gravity, z: 0 });
}

/** 정적 박스 콜라이더 생성 (중심 좌표, 전체 크기) */
export function addStaticBox(
  world: RAPIER.World,
  center: [number, number, number],
  size: [number, number, number],
) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...center));
  return world.createCollider(RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2), body);
}

/** 정적 삼각형 메시 콜라이더 (A2 지형: 렌더 메시와 일치하는 충돌). 내부 모서리 보정으로 평평한 이웃 삼각형 사이의 걸림을 줄인다 */
export function addStaticTrimesh(world: RAPIER.World, vertices: Float32Array, indices: Uint32Array) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  return world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), body);
}
