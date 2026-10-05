import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { Input } from '../core/input';
import type { ImpulseTarget } from '../core/types';
import { TUNING } from '../config/tuning';

const P = TUNING.player;

/**
 * 1인칭 플레이어. 자체 속도 적분 + Rapier KinematicCharacterController(충돌 해소).
 * 반동 임펄스는 velocity 에 직접 더해진다: Δv = J / mass.
 * 공중 조작력(airAccel)이 낮아 반동으로 얻은 수평 운동량이 보존된다.
 */
export class PlayerController implements ImpulseTarget {
  readonly velocity = new THREE.Vector3();
  readonly position = new THREE.Vector3(); // 발 위치
  yaw = 0;
  pitch = 0;
  grounded = false;
  /** 방금 착지 시 하강 속도(낙하 피해 계산용, 매 프레임 갱신: 착지 프레임에만 >0) */
  landingSpeed = 0;
  /** 외부 시스템(코일 충전 등)이 설정하는 이동속도 배율 */
  speedMul = 1;

  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private halfCyl = (P.height - 2 * P.radius) / 2;

  constructor(world: RAPIER.World, private camera: THREE.PerspectiveCamera, spawn: THREE.Vector3) {
    this.position.copy(spawn);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + P.height / 2, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(this.halfCyl, P.radius), this.body);
    this.controller = world.createCharacterController(0.01);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.enableAutostep(0.4, 0.2, false);
  }

  get mass() { return P.mass; }

  /** J (N·s) → Δv = J/m */
  applyImpulse(impulse: THREE.Vector3) {
    this.velocity.addScaledVector(impulse, 1 / P.mass);
    if (impulse.y > 0) this.grounded = false; // 위로 쏘아 올려지면 즉시 공중 처리
  }

  /** 조준 방향(카메라 전방) */
  aimDirection(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
  eyePosition(out = new THREE.Vector3()) {
    return out.copy(this.position).setY(this.position.y + P.eyeHeight);
  }

  update(dt: number, input: Input) {
    // 시점
    this.yaw -= input.mouseDX * P.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * P.mouseSensitivity, -1.5, 1.5);

    // 입력 → 목표 수평 속도
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const r = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const wish = new THREE.Vector3(
      -Math.sin(this.yaw) * f + Math.cos(this.yaw) * r,
      0,
      -Math.cos(this.yaw) * f - Math.sin(this.yaw) * r,
    );
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(P.moveSpeed * this.speedMul);
    const hasInput = wish.lengthSq() > 0;

    const hv = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    if (this.grounded) {
      if (hasInput) {
        // 목표 속도 쪽으로 수렴 (초과 속도도 감속시킴)
        const diff = wish.clone().sub(hv);
        const step = Math.min(diff.length(), P.groundAccel * dt);
        if (diff.lengthSq() > 0) hv.addScaledVector(diff.normalize(), step);
      } else {
        const sp = hv.length();
        hv.multiplyScalar(sp > 0 ? Math.max(0, sp - P.groundFriction * dt) / sp : 0);
      }
    } else if (hasInput) {
      // 공중: 현재 속도가 목표 속도 이상인 방향으로는 가속하지 않는다 (운동량 보존)
      const along = hv.dot(wish) / wish.length();
      if (along < wish.length()) {
        const add = Math.min(P.airAccel * dt, wish.length() - along);
        hv.addScaledVector(wish.clone().normalize(), add);
      }
    }
    this.velocity.x = hv.x;
    this.velocity.z = hv.z;

    if (this.grounded && input.justPressed('Space')) {
      this.velocity.y = P.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= TUNING.world.gravity * dt;

    // 충돌 해소 이동
    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const m = this.controller.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.collider.setTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    // 막힌 축 속도 제거
    if (Math.abs(m.x - desired.x) > 1e-4) this.velocity.x = m.x / dt;
    if (Math.abs(m.z - desired.z) > 1e-4) this.velocity.z = m.z / dt;
    const wasGrounded = this.grounded;
    const hitFloor = desired.y < 0 && m.y > desired.y + 1e-4;
    const hitCeil = desired.y > 0 && m.y < desired.y - 1e-4;
    this.landingSpeed = 0;
    if (hitFloor) {
      if (!wasGrounded) this.landingSpeed = -this.velocity.y;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = this.controller.computedGrounded() && this.velocity.y <= 0;
      if (hitCeil) this.velocity.y = 0;
    }

    this.position.set(t.x + m.x, t.y + m.y - P.height / 2, t.z + m.z);
    this.eyePosition(this.camera.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
