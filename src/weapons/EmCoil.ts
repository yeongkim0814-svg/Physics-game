import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { Input } from '../core/input';
import type { AimSource, Conductor, Damageable, WeaponFeedback } from '../core/types';
import { TUNING } from '../config/tuning';
import type { PlayerController } from '../player/PlayerController';
import type { ArcEffects } from './ArcEffects';
import { perturbDirection } from './aim';
import { arcDamage, chargeStep, nearestWithin, overchargeFraction } from './coilMath';
import { propagate } from './conductorGraph';
import { segmentSphereToi } from './launcherMath';
import type { Weapon } from './Weapon';

const C = TUNING.coil;
const MUZZLE = TUNING.launcher.muzzleOffset;

export interface CoilDeps {
  world: RAPIER.World;
  player: PlayerController;
  aim: AimSource;
  fx: WeaponFeedback;
  arcs: ArcEffects;
  /** 맵의 정적 전도체(물/금속 구조물) */
  staticConductors: () => Conductor[];
  /** 살아있는 몹 (투사체와 같은 Damageable + Conductor) */
  mobTargets: () => (Damageable & Partial<Conductor>)[];
  isInWater: (x: number, z: number) => boolean;
}

/**
 * 베이스 B: 전자기 코일.
 * 클릭 유지 = 충전(시간에 비례해 위력↑, 이동 느려짐) → 놓으면 전방 빔 방출 → 맞은 전도체에서 연쇄.
 * 누전: 물 위에서 충전하면 계속 감전, 방출 시 물/구조물을 타고 연쇄가 사용자에게 돌아오면 자기도 피해(팀킬 포함, 막지 않음).
 */
export class EmCoil implements Weapon {
  readonly name = '전자기 코일';
  /** 충전량 0..overchargeMax (1.0 = 최대 위력) */
  charge = 0;
  private cooldown = 0;
  private playerPos = new THREE.Vector3();
  /** 사용자도 전도체다: 연쇄가 닿으면 누전 피해. 배율(절연 피복)은 방출 시점의 스탯 */
  private leakMul = 1;
  private playerConductor: Conductor;
  shots = 0;
  status = '';
  /** 디버그/튜닝: 마지막 방출 결과 */
  last = { damage: 0, hits: 0, selfDamage: 0, hops: 0 };

  constructor(private d: CoilDeps) {
    this.playerConductor = {
      position: this.playerPos, kind: 'player', conducts: true, radius: C.contactRadius,
      shock: (dmg) => { this.last.selfDamage += dmg * this.leakMul; this.d.player.takeDamage(dmg * this.leakMul, 'leak'); },
    };
  }

  hudLines(): string[] {
    const c = this.charge;
    const bar = '▮'.repeat(Math.round(Math.min(c, 1) * 10)).padEnd(10, '▯') + (c > 1 ? '▮'.repeat(Math.round((c - 1) * 10)) : '');
    return [
      `${this.name}`,
      `충전 [${bar}] ${(c * 100).toFixed(0)}%${c > C.overchargeAt ? '  과충전!' : ''}`,
      `위력 ${arcDamage(C.maxDamage, Math.max(c, 0)).toFixed(0)}  사거리 ${C.arcRange.toFixed(0)}m  연쇄 ${C.chainRadius.toFixed(1)}m  누전x${C.leakDamageMul.toFixed(2)}`,
      this.status,
    ];
  }

  update(dt: number, input: Input) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.d.fx.setGlow(this.charge / C.overchargeMax);
    this.status = '';

    if (!input.active) { this.cancel(); return; }

    const charging = input.fire && this.cooldown <= 0;
    if (charging) {
      this.charge = chargeStep(this.charge, dt, C.chargeTime, C.overchargeMax);
      this.d.player.speedMul = TUNING.player.chargeSlowMul; // 충전 중 무방비
      // 누전: 물웅덩이 위에서 충전하면 충전량에 비례해 계속 감전
      const p = this.d.player.position;
      if (this.d.isInWater(p.x, p.z)) {
        this.d.player.takeDamage(C.waterLeakDps * Math.min(this.charge, 1) * dt * C.leakDamageMul, 'leak');
        this.status = '누전 중!';
      }
      if (this.charge >= C.overchargeMax) this.release(); // 과충전 한계: 자동 방출
    } else if (this.charge > 0) {
      this.release();
    }
  }

  reset() { this.cancel(); }

  private cancel() {
    this.charge = 0;
    this.d.player.speedMul = 1;
  }

  private release() {
    const charge = this.charge;
    this.cancel();
    if (charge < C.minCharge) return; // 불발
    this.fire(charge);
    this.cooldown = C.cooldown;
  }

  private fire(charge: number) {
    const { player, world } = this.d;
    this.leakMul = C.leakDamageMul;
    this.last = { damage: arcDamage(C.maxDamage, charge), hits: 0, selfDamage: 0, hops: 0 };

    const aim = this.d.aim.muzzleAim();
    const dir = perturbDirection(aim.dir, C.spread);
    const origin = aim.origin.addScaledVector(dir, MUZZLE);
    this.playerPos.copy(player.position).setY(player.position.y + 0.9);

    // 빔: 월드(정적)와 몹 중 먼저 맞는 것
    let toi: number = C.arcRange;
    let direct: (Damageable & Partial<Conductor>) | null = null;
    let worldHit = false;
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const wh = world.castRay(ray, C.arcRange, true, undefined, undefined, undefined, player.body);
    if (wh) { toi = wh.timeOfImpact; worldHit = true; }
    for (const t of this.d.mobTargets()) {
      if (!t.hitRadius) continue;
      const h = segmentSphereToi([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], toi,
        [t.position.x, t.position.y, t.position.z], t.hitRadius);
      if (h !== null && h < toi) { toi = h; direct = t; worldHit = false; }
    }
    const end = origin.clone().addScaledVector(dir, toi);
    this.d.arcs.spawn(origin, end, 0.15);

    // 시작 전도체: 직접 맞은 몹 / 맞은 지점 근처의 정적 전도체(물·금속) / 물 위에 서 있다면 발밑의 물
    const statics = this.d.staticConductors();
    const starts: Conductor[] = [];
    if (direct) {
      if (isConductor(direct)) starts.push(direct);
      else direct.takeDamage(this.last.damage, 'electric');
    } else if (worldHit) {
      const snap = nearestWithin(end, statics, C.snapRadius);
      if (snap) { starts.push(snap); this.d.arcs.spawn(end, snap.position, 0.1); }
    }
    if (this.d.isInWater(player.position.x, player.position.z)) {
      const w = nearestWithin(this.playerPos, statics, 4, (c) => c.kind === 'water');
      if (w && !starts.includes(w)) starts.push(w);
    }

    const all: Conductor[] = [...statics, ...this.d.mobTargets().filter(isConductor), this.playerConductor];
    const hits = propagate(starts, all, {
      linkRadius: C.chainRadius, contactRadius: C.contactRadius,
      falloff: C.chainFalloff, maxHops: C.chainMaxHops, baseDamage: this.last.damage,
    });
    for (const h of hits) {
      h.conductor.shock(h.damage);
      if (h.from) this.d.arcs.spawn(h.from.position, h.conductor.position, 0.2);
      this.last.hops = Math.max(this.last.hops, h.hop);
    }
    this.last.hits = hits.length;

    const frac = overchargeFraction(charge, C.overchargeAt, C.overchargeMax);
    this.d.fx.kick(0.6 + frac);
    this.d.player.kick(TUNING.launcher.cameraKick * 0.8, 0);
    this.shots++;
  }
}

const isConductor = (d: Damageable & Partial<Conductor>): d is Damageable & Conductor =>
  typeof d.shock === 'function' && d.kind !== undefined;
