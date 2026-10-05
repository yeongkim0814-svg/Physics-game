import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import { moveCharacter } from '../core/characterMotor';
import type { Conductor, Damageable, DamageSource, MobDef } from '../core/types';
import type { PlayerController } from '../player/PlayerController';
import { TUNING } from '../config/tuning';
import { CUES } from '../render/palette';
import { buildMobModel, type MobModel } from './mobModel';
import { READY, chaseDir, separation, stepAttack, turnToward, type AttackState } from './mobMath';

const M = TUNING.mobs;
const FLASH = 0.14;

/**
 * 몹 1마리: 단순 추적 AI(접근 → 근접 공격) + 피해/전도체 인터페이스.
 * Damageable 과 Conductor 를 동시에 구현해 투사체(takeDamage)와 코일 연쇄(shock) 양쪽에서 같은 몹이 맞는다.
 * 피해 배율(금속=전기에 약함, 절연=물리에 약함)은 이 클래스 안에서 적용되므로 호출측은 원 피해량만 넘긴다.
 */
export class Mob implements Damageable, Conductor {
  /** 몸통 중심 (판정/전도 위치) */
  readonly position = new THREE.Vector3();
  readonly feet = new THREE.Vector3();
  readonly hitRadius = M.hitRadius;
  readonly kind: Conductor['kind'];
  readonly conducts: boolean;
  /** 연쇄 반경 (Conductor 계약) */
  readonly radius = TUNING.coil.chainRadius;
  hp: number;
  dead = false;
  aggro = false;
  yaw = 0;

  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private model: MobModel;
  private vy = 0;
  private grounded = false;
  private attack: AttackState = READY;
  private flashT = 0;
  private walkT = Math.random() * 6;
  private bob = 0;

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    private controller: RAPIER.KinematicCharacterController,
    readonly def: MobDef,
    spawn: [number, number, number],
    private onDeath: (m: Mob) => void,
  ) {
    this.hp = def.maxHp;
    this.conducts = def.conducts;
    this.kind = def.id === 'metal' ? 'metal_mob' : def.id === 'insulator' ? 'insulator_mob' : 'normal_mob';
    this.feet.set(spawn[0], spawn[1] + 0.05, spawn[2]);

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.feet.x, this.feet.y + M.height / 2, this.feet.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule((M.height - 2 * M.radius) / 2, M.radius), this.body,
    );
    this.model = buildMobModel(def);
    scene.add(this.model.group);
    this.sync();
  }

  /** 디버그/테스트용 순간이동 (발 위치) */
  teleport(x: number, y: number, z: number) {
    if (this.dead) return; // 제거된 물리 바디를 건드리면 wasm 이 abort 한다
    this.feet.set(x, y, z);
    this.vy = 0;
    this.body.setTranslation({ x, y: y + M.height / 2, z }, true);
    this.collider.setTranslation({ x, y: y + M.height / 2, z });
    this.sync();
  }

  takeDamage(amount: number, source: DamageSource) {
    if (this.dead || amount <= 0) return;
    const mul = source === 'electric' ? this.def.damageMul.electric
      : source === 'physical' ? this.def.damageMul.physical : 1;
    this.hp -= amount * mul;
    this.aggro = true; // 맞으면 경계
    this.flashT = FLASH;
    if (this.hp <= 0) this.die();
  }

  /** Conductor 계약: 전기를 맞음 (전기 피해 배율은 takeDamage 에서 적용) */
  shock(damage: number) { this.takeDamage(damage, 'electric'); }

  update(dt: number, player: PlayerController, others: Mob[]) {
    if (this.dead) return;
    const dx = player.position.x - this.feet.x, dz = player.position.z - this.feet.z;
    const dist = Math.hypot(dx, dz);
    const dy = Math.abs(player.position.y - this.feet.y);

    if (!this.aggro && dist < M.aggroRange && !player.dead) this.aggro = true;
    else if (this.aggro && (dist > M.loseRange || player.dead)) this.aggro = false;

    const windingUp = this.attack.phase === 'windup';
    let vx = 0, vz = 0;
    if (this.aggro && !windingUp) {
      const [cx, cz] = chaseDir(this.feet.x, this.feet.z, player.position.x, player.position.z);
      const go = dist > M.stopDistance ? 1 : 0;
      const [sx, sz] = separation(this.feet.x, this.feet.z,
        others.filter((o) => o !== this && !o.dead).map((o) => [o.feet.x, o.feet.z] as [number, number]), M.separation);
      vx = (cx * go + sx) * this.def.speed;
      vz = (cz * go + sz) * this.def.speed;
    }
    if (this.aggro) this.yaw = turnToward(this.yaw, Math.atan2(-dx, -dz), M.turnSpeed * dt);

    this.vy -= TUNING.world.gravity * dt;
    const desired = { x: vx * dt, y: this.vy * dt, z: vz * dt };
    const t = this.body.translation();
    const m = moveCharacter(this.controller, this.collider, t, desired, this.grounded);
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.collider.setTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    if (desired.y < 0 && m.y > desired.y + 1e-4) { this.vy = 0; this.grounded = true; }
    else this.grounded = this.controller.computedGrounded() && this.vy <= 0;
    this.feet.set(t.x + m.x, t.y + m.y - M.height / 2, t.z + m.z);

    // 근접 공격: 사거리 진입 → 예고(windup) → 끝날 때 아직 사거리 안이면 타격
    const inReach = this.aggro && dist <= M.meleeReach && dy < 1.5;
    const step = stepAttack(this.attack, dt, inReach, M.windup, M.meleeCooldown);
    this.attack = step.state;
    if (step.hit) player.takeDamage(this.def.meleeDamage, 'physical');

    this.animate(dt, vx, vz, windingUp);
    this.sync();
  }

  private animate(dt: number, vx: number, vz: number, windingUp: boolean) {
    const g = this.model.group;
    this.walkT += dt * (Math.hypot(vx, vz) > 0.1 ? 10 : 1.5);
    g.rotation.y = this.yaw;
    // 예고 동작: 몸이 부풀고 눈이 밝아진다 (가독성 있는 공격 신호)
    const wind = windingUp ? 1 - this.attack.t / M.windup : 0;
    g.scale.setScalar(1 + 0.25 * wind);
    this.bob = Math.abs(Math.sin(this.walkT)) * 0.06;
    for (const e of this.model.eyeMats) e.emissive.setHex(CUES.enemy).multiplyScalar(1 + wind * 1.5);
    // 피격 섬광
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT / FLASH;
    for (const { mat, base } of this.model.bodyMats) mat.emissive.copy(base).lerp(new THREE.Color(0xffffff), f);
  }

  private sync() {
    this.position.set(this.feet.x, this.feet.y + 0.9, this.feet.z);
    this.model.group.position.x = this.feet.x;
    this.model.group.position.z = this.feet.z;
    this.model.group.position.y = this.feet.y + this.bob;
  }

  private die() {
    this.dead = true;
    this.world.removeCollider(this.collider, false);
    this.world.removeRigidBody(this.body);
    this.scene.remove(this.model.group);
    this.onDeath(this);
  }
}
