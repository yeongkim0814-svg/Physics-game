import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import { TUNING } from '../config/tuning';
import { aimRayStart, aimTargetPoint } from '../weapons/aim';
import { clampCameraDistance, followFactor, orbitOffset, smoothDistance } from './cameraMath';
import type { PlayerController } from './PlayerController';

const C = TUNING.camera;
/** 카메라 충돌은 정적 지형만 (플레이어·몹=kinematic, 돌=dynamic 제외) */
const CAMERA_FILTER = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
/** 조준선은 돌(dynamic)만 무시: 몹(kinematic)은 조준 대상이 된다 */
const AIM_FILTER = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC;
const NO_ROT = { x: 0, y: 0, z: 0, w: 1 };

/**
 * 어깨 너머 추적 카메라. 시점(player.yaw/pitch)으로 궤도를 돌고, 피벗(발+height)을 followSmooth 로 따라간다.
 * 플레이어 실제 피벗 → 카메라 목표 위치로 공(반지름 collisionPadding) 캐스트를 쏴 가려지면 거리를 줄인다
 * (줄 때는 즉시, 늘 때만 recoverSmooth 로 천천히). minDistance 아래로는 줄이지 않는다.
 * 또한 화면 중앙 조준선의 목표점을 계산한다(aimTarget).
 */
export class ThirdPersonCamera {
  private pivot = new THREE.Vector3();      // 보간된 피벗
  private truePivot = new THREE.Vector3();  // 플레이어 실제 피벗 (충돌 캐스트 시작점)
  private dist = 0;
  private ball = new RAPIER.Ball(C.collisionPadding);
  /** 디버그/검증: 마지막 프레임에서 가림으로 줄어든 비율 (1 = 가림 없음) */
  clearance = 1;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private world: RAPIER.World,
    private player: PlayerController,
  ) {
    this.snap();
  }

  /** 보간 없이 즉시 맞춘다 (스폰/부활/순간이동) */
  snap() {
    this.updateTruePivot();
    this.pivot.copy(this.truePivot);
    this.dist = Math.hypot(C.shoulderOffset, C.distance);
    this.place(0, true);
  }

  update(dt: number) {
    this.updateTruePivot();
    this.pivot.lerp(this.truePivot, followFactor(C.followSmooth, dt));
    this.place(dt, false);
  }

  /** 카메라 정면(= 조준선 방향) */
  forward(out = new THREE.Vector3()) {
    return this.player.lookDirection(out);
  }

  /**
   * 화면 중앙 조준선이 닿는 목표점. muzzle 보다 뒤쪽(카메라와 캐릭터 사이)은 무시하고,
   * 아무것도 없으면 aimMaxRange 만큼 떨어진 먼 점.
   */
  aimTarget(muzzle: THREE.Vector3): THREE.Vector3 {
    const cam = this.camera.position;
    const fwd = this.forward();
    const start = aimRayStart(cam, fwd, muzzle);
    const o = cam.clone().addScaledVector(fwd, start);
    const maxToi = Math.max(0.01, C.aimMaxRange - start);
    const hit = this.world.castRay(
      new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: fwd.x, y: fwd.y, z: fwd.z }),
      maxToi, true, AIM_FILTER, undefined, undefined, this.player.body,
    );
    return aimTargetPoint(cam, fwd, start, hit ? hit.timeOfImpact : null, C.aimMaxRange);
  }

  private updateTruePivot() {
    this.truePivot.copy(this.player.position).setY(this.player.position.y + C.height);
  }

  private place(dt: number, instant: boolean) {
    const off = orbitOffset(this.player.yaw, this.player.pitch, C.shoulderOffset, C.distance);
    const desired = this.pivot.clone().add(off);
    const v = desired.clone().sub(this.truePivot);
    const want = v.length();
    const dir = v.divideScalar(want || 1);

    let hit: number | null = null;
    const cast = this.world.castShape(
      this.truePivot, NO_ROT, dir, this.ball, 0, want, true,
      CAMERA_FILTER, undefined, undefined, this.player.body,
    );
    if (cast) hit = cast.time_of_impact;
    const target = clampCameraDistance(want, hit, C.minDistance);
    this.dist = instant ? target : smoothDistance(this.dist, target, C.recoverSmooth, dt);
    this.dist = Math.min(this.dist, target);
    this.clearance = want > 0 ? this.dist / want : 1;

    this.camera.position.copy(this.truePivot).addScaledVector(dir, this.dist);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
  }
}
