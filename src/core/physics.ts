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
