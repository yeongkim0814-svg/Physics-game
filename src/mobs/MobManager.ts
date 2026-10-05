import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { Conductor, Damageable } from '../core/types';
import type { MobSpawnDef } from '../data/map';
import { MOBS } from '../data/mobs';
import type { PlayerController } from '../player/PlayerController';
import type { Loot } from '../world/Loot';
import { Mob } from './Mob';
import { rollDrop } from './mobMath';

/** 몹 생성/갱신/사망 처리(전리품 드롭). 몹 수 상한은 PERF.mobCap */
export class MobManager {
  readonly mobs: Mob[] = [];
  private controller: RAPIER.KinematicCharacterController;
  kills = 0;

  constructor(scene: THREE.Scene, world: RAPIER.World, private loot: Loot, spawns: MobSpawnDef[], cap: number) {
    this.controller = world.createCharacterController(0.01);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    for (const s of spawns.slice(0, cap)) {
      this.mobs.push(new Mob(scene, world, this.controller, MOBS[s.kind], s.pos, (m) => this.onDeath(m)));
    }
  }

  get alive() { return this.mobs.filter((m) => !m.dead); }
  /** 투사체/빔 피격 대상 */
  targets(): Damageable[] { return this.alive; }
  /** 코일 연쇄 대상 (전도 여부는 각 Conductor.conducts) */
  conductors(): Conductor[] { return this.alive; }

  update(dt: number, player: PlayerController) {
    for (const m of this.mobs) m.update(dt, player, this.mobs);
  }

  private onDeath(m: Mob) {
    this.kills++;
    const drop = rollDrop(m.def.drop, Math.random);
    if (Object.keys(drop).length) this.loot.spawn([m.feet.x, m.feet.y, m.feet.z], drop);
  }
}
