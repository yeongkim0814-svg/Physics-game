import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { ThrowSource } from '../core/types';
import { gameEvents, type StoneInfo, type StoneKind } from '../core/events';
import { TUNING } from '../config/tuning';
import { VISUAL } from '../config/settings';
import { lambert } from '../render/palette';
import { cullReason, evictForRoom, throwVelocity, tickCooldown, type V3 } from './throwMath';

const T = TUNING.throwable;

/** 던지기에 필요한 입력 (core/input.ts 의 Input 이 만족한다) */
export interface ThrowInput {
  /** 입력을 받을 수 있는 상태인가 (포인터 잠금/터치 활성) */
  readonly active: boolean;
  readonly throwPressed: boolean;
  readonly throwHeavyPressed: boolean;
}

interface Stone {
  info: StoneInfo;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  /** 놓은 시점의 물리 스텝 번호 / 그때의 돌 바닥 높이 */
  launchStep: number;
  startBottomY: number;
  /** 처음 닿은 스텝 번호 (아직이면 null) */
  landedStep: number | null;
}

/** 종류별 정의: 질량·반지름은 TUNING.throwable, 색은 VISUAL.throwable */
const KINDS: Record<StoneKind, { mass: number; radius: number; color: number }> = {
  light: { mass: T.stoneMass, radius: T.stoneRadius, color: VISUAL.throwable.light },
  heavy: { mass: T.heavyMass, radius: T.heavyRadius, color: VISUAL.throwable.heavy },
};

/**
 * 던지는 돌 (Rapier dynamic 구). 조준 방향으로 던지거나(throwStone), 지정 위치에 놓는다(release).
 * 낙하 가속은 질량과 무관(공기저항 0). 처음 지면/구조물에 닿으면 gameEvents.onLanded 로 낙하 시간을 알린다.
 * 시간은 시뮬레이션 스텝 수 * world.timestep 이라 렌더 프레임률과 무관하다.
 *
 * 호출 순서(프레임마다): update(dt, input) → world.step() → afterStep()
 */
export class Throwables {
  private stones: Stone[] = [];
  private cooldown = 0;
  private steps = 0;
  private nextId = 1;
  private geo = new THREE.IcosahedronGeometry(1, 0);
  private mats: Record<StoneKind, THREE.Material> = {
    light: lambert(KINDS.light.color), heavy: lambert(KINDS.heavy.color),
  };

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    private source: ThrowSource,
  ) {}

  get active(): readonly StoneInfo[] { return this.stones.map((s) => s.info); }
  /** 시뮬레이션 경과 시간 (s) */
  get simTime() { return this.steps * this.world.timestep; }

  update(dt: number, input: ThrowInput) {
    this.cooldown = tickCooldown(this.cooldown, dt);
    if (!input.active || this.cooldown > 0) return;
    const kind: StoneKind | null = input.throwPressed ? 'light' : input.throwHeavyPressed ? 'heavy' : null;
    if (kind) {
      this.throwStone(kind);
      this.cooldown = T.cooldown;
    }
  }

  /** 손에서 화면 중앙 조준점 방향으로 던진다 (손 앞 muzzleOffset 에서 생성, 플레이어 속도 승계) */
  throwStone(kind: StoneKind) {
    const { origin, dir } = this.source.handAim();
    const pos = origin.addScaledVector(dir, T.muzzleOffset);
    const vel = throwVelocity(dir, T.throwSpeed, this.source.velocity, T.inheritPlayerVelocity);
    return this.release(kind, pos, vel);
  }

  /** 돌 중심 pos 에 속도 vel(기본 정지)로 놓는다. 낙하 실험(탑 위에서 놓기)에도 쓴다 */
  release(kind: StoneKind, pos: V3, vel: V3 = { x: 0, y: 0, z: 0 }): StoneInfo {
    for (const i of evictForRoom(this.stones.map((s) => this.ageOf(s)), T.maxActive).sort((a, b) => b - a)) {
      this.remove(i);
    }
    const k = KINDS[kind];
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z).setLinvel(vel.x, vel.y, vel.z)
        .setLinearDamping(T.linearDamping).setAngularDamping(T.angularDamping).setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(k.radius).setMass(k.mass).setRestitution(T.restitution).setFriction(T.friction),
      body,
    );
    const mesh = new THREE.Mesh(this.geo, this.mats[kind]);
    mesh.scale.setScalar(k.radius);
    mesh.position.set(pos.x, pos.y, pos.z);
    this.scene.add(mesh);
    const info: StoneInfo = { id: this.nextId++, kind, mass: k.mass, radius: k.radius };
    this.stones.push({ info, body, collider, mesh, launchStep: this.steps, startBottomY: pos.y - k.radius, landedStep: null });
    return info;
  }

  /** world.step() 직후 호출: 메시 동기화, 착지 감지/이벤트, 정리 */
  afterStep() {
    this.steps++;
    const dt = this.world.timestep;
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      const p = s.body.translation(), r = s.body.rotation();
      s.mesh.position.set(p.x, p.y, p.z);
      s.mesh.quaternion.set(r.x, r.y, r.z, r.w);

      if (s.landedStep === null && this.touchesFixed(s)) {
        s.landedStep = this.steps;
        gameEvents.onLanded.emit(s.info, (this.steps - s.launchStep) * dt, s.startBottomY - (p.y - s.info.radius));
      }
      const reason = cullReason(
        { age: this.ageOf(s), y: p.y, landedFor: s.landedStep === null ? null : (this.steps - s.landedStep) * dt },
        { maxAge: T.maxAge, voidY: T.voidY, settledLife: T.settledLife },
      );
      if (reason) this.remove(i);
    }
  }

  /** 모든 돌 제거 (리스폰/리셋용) */
  clear() { for (let i = this.stones.length - 1; i >= 0; i--) this.remove(i); }

  private ageOf(s: Stone) { return (this.steps - s.launchStep) * this.world.timestep; }

  /** 고정 바디(지형·건물)와 실제로 접촉 중인가 */
  private touchesFixed(s: Stone): boolean {
    let hit = false;
    this.world.contactPairsWith(s.collider, (other) => {
      if (hit || !other.parent()?.isFixed()) return;
      this.world.contactPair(s.collider, other, (m) => {
        for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) <= T.contactTolerance) hit = true;
      });
    });
    return hit;
  }

  private remove(i: number) {
    const s = this.stones[i];
    this.scene.remove(s.mesh);
    this.world.removeRigidBody(s.body);
    this.stones.splice(i, 1);
  }
}
