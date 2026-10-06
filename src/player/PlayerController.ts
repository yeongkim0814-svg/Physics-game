import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import { moveCharacter } from '../core/characterMotor';
import { fallDamage } from './damage';
import type { PlayerInput } from '../core/input';
import type { Damageable, DamageSource, ImpulseTarget } from '../core/types';
import { TUNING } from '../config/tuning';

const P = TUNING.player;

/**
 * 1인칭 플레이어. 자체 속도 적분 + Rapier KinematicCharacterController(충돌 해소).
 * 반동 임펄스는 velocity 에 직접 더해진다: Δv = J / mass.
 * 공중 조작력(airAccel)이 낮아 반동으로 얻은 수평 운동량이 보존된다.
 */
export class PlayerController implements ImpulseTarget, Damageable {
  readonly velocity = new THREE.Vector3();
  readonly position = new THREE.Vector3(); // 발 위치
  hp: number = P.maxHp;
  /** 사망 처리(리스폰)는 GameLoop 가 담당. 여기서는 상태만 둔다 */
  dead = false;
  /** 마지막으로 피해를 입은 시각(초, performance.now/1000) — 피격 연출용 */
  lastHitAt = -999;
  yaw = 0;
  pitch = 0;
  grounded = false;
  /** 방금 착지 시 하강 속도(낙하 피해 계산용, 매 프레임 갱신: 착지 프레임에만 >0) */
  landingSpeed = 0;
  /** 외부 시스템(코일 충전 등)이 설정하는 이동속도 배율 */
  speedMul = 1;
  /** 반동을 받은 뒤 남은 미끄러짐 시간 (지면 마찰 약화) */
  private slideTimer = 0;
  /** 계단을 오를 때 카메라가 한 단씩 튀지 않게 하는 시각 오프셋(<=0). 실제 눈 위치(조준/사격)에는 영향 없음 */
  private eyeLag = 0;

  readonly body: RAPIER.RigidBody;
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
  }

  get mass() { return P.mass; }

  /** J (N·s) → Δv = J/m */
  applyImpulse(impulse: THREE.Vector3) {
    this.velocity.addScaledVector(impulse, 1 / P.mass);
    if (impulse.y > 0) this.grounded = false; // 위로 쏘아 올려지면 즉시 공중 처리
    this.slideTimer = P.recoilSlideTime;
  }

  /** 몹 공격, 낙하, 누전 등 모든 피해의 단일 진입점 */
  takeDamage(amount: number, _source: DamageSource) {
    if (this.dead || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHitAt = performance.now() / 1000;
    if (this.hp <= 0) this.dead = true;
  }

  /** 발 위치로 순간이동 (리스폰/스폰용). 속도 초기화 */
  teleport(x: number, y: number, z: number) {
    this.body.setTranslation({ x, y: y + P.height / 2, z }, true);
    this.collider.setTranslation({ x, y: y + P.height / 2, z });
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  /** 발사 반동 등으로 시점이 튐 (rad). pitch 는 위쪽(+) */
  kick(pitch: number, yaw: number) {
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -1.5, 1.5);
    this.yaw += yaw;
  }

  /** 조준 방향(카메라 전방) */
  aimDirection(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
  eyePosition(out = new THREE.Vector3()) {
    return out.copy(this.position).setY(this.position.y + P.eyeHeight);
  }

  update(dt: number, input: PlayerInput) {
    // 시점
    this.yaw -= input.lookDX * P.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookDY * P.mouseSensitivity, -1.5, 1.5);

    // 입력 → 목표 수평 속도 (아날로그: 조이스틱은 기울기에 비례)
    const f = input.moveY;
    const r = input.moveX;
    const wish = new THREE.Vector3(
      -Math.sin(this.yaw) * f + Math.cos(this.yaw) * r,
      0,
      -Math.cos(this.yaw) * f - Math.sin(this.yaw) * r,
    );
    if (wish.lengthSq() > 1) wish.normalize();
    // 전력질주: 전진 입력일 때만. 충전 등으로 이동이 느려진 상태(speedMul<1)에서는 겹쳐 적용하지 않는다
    const sprinting = input.sprint && f > 0.1 && this.speedMul >= 1;
    wish.multiplyScalar(P.moveSpeed * this.speedMul * (sprinting ? P.sprintMul : 1));
    const hasInput = wish.lengthSq() > 1e-6;

    const hv = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    // 반동 직후에는 지면에 있어도 공중 규칙(운동량 보존) + 약한 마찰을 적용
    const sliding = this.slideTimer > 0;
    this.slideTimer = Math.max(0, this.slideTimer - dt);
    if (this.grounded && !sliding) {
      if (hasInput) {
        // 목표 속도 쪽으로 수렴 (초과 속도도 감속시킴)
        const diff = wish.clone().sub(hv);
        const step = Math.min(diff.length(), P.groundAccel * dt);
        if (diff.lengthSq() > 0) hv.addScaledVector(diff.normalize(), step);
      } else {
        const sp = hv.length();
        hv.multiplyScalar(sp > 0 ? Math.max(0, sp - P.groundFriction * dt) / sp : 0);
      }
    } else {
      if (this.grounded) {
        const sp = hv.length();
        hv.multiplyScalar(sp > 0 ? Math.max(0, sp - P.groundFriction * P.slideFrictionMul * dt) / sp : 0);
      }
      if (hasInput) {
        // 현재 속도가 목표 속도 이상인 방향으로는 가속하지 않는다 (운동량 보존)
        const along = hv.dot(wish) / wish.length();
        if (along < wish.length()) {
          const add = Math.min(P.airAccel * dt, wish.length() - along);
          hv.addScaledVector(wish.clone().normalize(), add);
        }
      }
    }
    this.velocity.x = hv.x;
    this.velocity.z = hv.z;

    if (this.grounded && input.jumpPressed) {
      this.velocity.y = P.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= TUNING.world.gravity * dt;

    // 충돌 해소 이동
    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    const t = this.body.translation();
    const m = moveCharacter(this.controller, this.collider, t, desired, this.grounded);
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.collider.setTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    // 막힌 축 속도 제거
    if (Math.abs(m.x - desired.x) > 1e-4) this.velocity.x = m.x / dt;
    if (Math.abs(m.z - desired.z) > 1e-4) this.velocity.z = m.z / dt;
    const wasGrounded = this.grounded;
    // 계단 오르기(지면에서 위로 올라선 이동): 물리 위치는 즉시 올라가지만 카메라는 부드럽게 따라온다
    if (wasGrounded && m.y > 0.03 && this.velocity.y <= 0.5) this.eyeLag = Math.max(this.eyeLag - m.y, -P.stepHeight * 1.5);
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

    if (this.landingSpeed > 0) this.takeDamage(fallDamage(this.landingSpeed, P.fallSafeSpeed, P.fallDamagePerSpeed), 'fall');

    this.position.set(t.x + m.x, t.y + m.y - P.height / 2, t.z + m.z);
    this.eyeLag *= Math.exp(-P.stepSmoothing * dt);
    this.eyePosition(this.camera.position);
    this.camera.position.y += this.eyeLag;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
