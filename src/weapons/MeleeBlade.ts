import * as THREE from 'three';
import type { Input } from '../core/input';
import type { Damageable, WeaponState } from '../core/types';
import { TUNING } from '../config/tuning';
import { computeStats, wearDurability } from '../data/loadout';
import type { PlayerController } from '../player/PlayerController';
import type { ViewModel } from './ViewModel';
import type { Weapon } from './Weapon';

const CONE_COS = Math.cos((TUNING.blade.coneDeg * Math.PI) / 360); // 전체 각의 절반

/** 근접무기(충격 블레이드): 클릭하면 시선 앞 reach 안, 원뿔 안의 대상에게 물리 피해. 휘두를 때마다 내구도가 닳는다 */
export class MeleeBlade implements Weapon {
  private cooldown = 0;
  status = '';
  hits = 0;
  constructor(public state: WeaponState, private player: PlayerController, private view: ViewModel, private targets: () => Damageable[]) {}

  hudLines(): string[] {
    const { stats } = computeStats(this.state);
    return [`근접 · 피해 ${stats.meleeDamage.toFixed(0)}  사거리 ${stats.meleeReach.toFixed(1)}m`, this.status];
  }

  update(dt: number, input: Input) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.view.update(dt);
    if (!input.active) return;
    const { disabled, stats } = computeStats(this.state);
    this.status = disabled ? 'BROKEN' : '';
    if (disabled || !input.fire || this.cooldown > 0) return;
    this.cooldown = stats.meleeInterval;
    this.view.kick(0.6);
    wearDurability(this.state, 'base', stats.durabilityCostPerShot);
    const eye = this.player.eyePosition();
    const aim = this.player.aimDirection();
    const to = new THREE.Vector3();
    for (const t of this.targets()) {
      to.copy(t.position).setY(t.position.y + 0.8).sub(eye);
      const d = to.length();
      if (d > stats.meleeReach + (t.hitRadius ?? 0.4) || d < 1e-3) continue;
      if (to.normalize().dot(aim) < CONE_COS) continue;
      t.takeDamage(stats.meleeDamage, 'physical');
      this.hits++;
    }
  }
}
