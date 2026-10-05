import type { Input } from '../core/input';
import type { WeaponState } from '../core/types';
import { TUNING } from '../config/tuning';
import { PARTS } from '../data/parts';
import { MATERIALS } from '../data/materials';
import { computeStats, wearDurability } from '../data/loadout';
import type { Inventory } from '../raid/inventory';
import type { PlayerController } from '../player/PlayerController';
import type { Projectiles } from './Projectiles';
import type { ViewModel } from './ViewModel';
import type { Weapon } from './Weapon';
import { perturbDirection } from './aim';
import {
  currentSpread, decayHeat, heatAfterShot, recoilDeltaV, recoilImpulse, rearWear,
} from './launcherMath';

const L = TUNING.launcher;

/**
 * 베이스 A: 운동량 사출기.
 * 발사 = 재료 소모 → 투사체(질량 m, 속도 v) 사출 → 반대 방향으로 J = m·v·recoil·scale 임펄스.
 * 비용: 재료 소모 + 베이스 내구도, 마모: 후방 슬롯 부품에 반동 부하로 누적.
 */
export class MomentumLauncher implements Weapon {
  private cooldown = 0;
  private heat = 0;
  shots = 0;
  /** HUD/디버그: 마지막 발사의 반동 Δv(m/s) */
  lastDeltaV = 0;
  status = '';

  constructor(
    public state: WeaponState,
    private player: PlayerController,
    private projectiles: Projectiles,
    private view: ViewModel,
    private inventory: Inventory,
  ) {}

  /** 현재 퍼짐 각(rad) — HUD 표시용 */
  get spread() {
    const { stats } = computeStats(this.state);
    return currentSpread(stats.spreadBase, this.heat, stats.stability, L.spread.max);
  }

  hudLines(): string[] {
    const { stats } = computeStats(this.state);
    const mat = MATERIALS[this.inventory.selected];
    return [
      `재료 ${mat.name} (${mat.mass}kg) x${this.inventory.count()}  [${Object.entries(this.inventory.materials).map(([k, v]) => `${k}:${v}`).join(' ')}]`,
      `퍼짐 ${(this.spread * 57.3).toFixed(1)}deg  반동 Δv ${this.lastDeltaV.toFixed(1)} m/s  v0 ${stats.projectileSpeed.toFixed(0)}`,
      this.status,
    ];
  }

  update(dt: number, input: Input) {
    this.heat = decayHeat(this.heat, L.spread.recover, dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.view.update(dt);
    if (input.swapPressed) this.inventory.cycle(1);
    if (!input.active) return;

    const { disabled, stats } = computeStats(this.state);
    this.status = disabled ? 'BROKEN' : '';
    if (disabled || !input.fire || this.cooldown > 0) return;

    const matId = this.inventory.selected;
    if (!this.inventory.consume(matId, stats.materialsPerShot)) { this.status = 'NO AMMO'; return; }
    const mat = MATERIALS[matId];

    // 방향: 조준 + 퍼짐(원뿔 내 균일 분포). 반동은 실제 발사 방향의 반대
    const aim = this.player.aimDirection();
    const dir = perturbDirection(aim, currentSpread(stats.spreadBase, this.heat, stats.stability, L.spread.max));
    const origin = this.player.eyePosition().addScaledVector(dir, L.muzzleOffset);
    this.projectiles.spawn(origin, dir, stats.projectileSpeed, mat.mass, mat.color);

    const J = recoilImpulse(mat.mass, stats.projectileSpeed, stats.recoil, L.recoilScale);
    this.player.applyImpulse(dir.clone().multiplyScalar(-J));
    this.lastDeltaV = recoilDeltaV(J, TUNING.player.mass);

    // 연사 퍼짐 누적 + 시점/모델 킥
    this.heat = heatAfterShot(this.heat, stats.spreadPerShot, L.spread.max);
    const strength = Math.min(1.5, this.lastDeltaV / 8);
    this.player.kick(L.cameraKick * strength, (Math.random() - 0.5) * L.cameraKick * strength);
    this.view.kick(strength);

    // 비용/마모: 베이스 내구도 + 후방 슬롯 부품(반동 부하)
    wearDurability(this.state, 'base', stats.durabilityCostPerShot);
    const rearId = this.state.loadout.parts.rear;
    if (rearId) wearDurability(this.state, rearId, rearWear(J, stats.wearPerRecoil, PARTS[rearId]?.wearRate ?? 1));

    this.cooldown = stats.fireInterval;
    this.shots++;
  }
}
