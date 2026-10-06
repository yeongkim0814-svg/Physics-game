import type { Input } from '../core/input';
import { TUNING } from '../config/tuning';
import type { PlayerController } from '../player/PlayerController';
import type { Projectiles } from './Projectiles';
import type { ViewModel } from './ViewModel';
import type { Weapon } from './Weapon';
import { perturbDirection } from './aim';
import { currentSpread, decayHeat, heatAfterShot, recoilDeltaV, recoilImpulse } from './launcherMath';

const L = TUNING.launcher;

/**
 * 운동량 사출기 (고정 스탯: TUNING.launcher).
 * 발사 = 투사체(질량 m, 속도 v) 사출 → 반대 방향으로 J = m·v·recoil·scale 임펄스.
 * 탄약 무제한, 연사 간격(fireInterval)만 제한한다.
 */
export class MomentumLauncher implements Weapon {
  readonly name = '운동량 사출기';
  private cooldown = 0;
  private heat = 0;
  shots = 0;
  /** HUD/디버그: 마지막 발사의 반동 Δv(m/s) */
  lastDeltaV = 0;

  constructor(
    private player: PlayerController,
    private projectiles: Projectiles,
    private view: ViewModel,
  ) {}

  /** 현재 퍼짐 각(rad) — HUD 표시용 */
  get spread() {
    return currentSpread(L.spread.base, this.heat, L.stability, L.spread.max);
  }

  hudLines(): string[] {
    return [
      this.name,
      `퍼짐 ${(this.spread * 57.3).toFixed(1)}deg  반동 Δv ${this.lastDeltaV.toFixed(1)} m/s  v0 ${L.projectileSpeed.toFixed(0)}`,
    ];
  }

  reset() {}

  update(dt: number, input: Input) {
    this.heat = decayHeat(this.heat, L.spread.recover, dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.view.update(dt);
    if (!input.active || !input.fire || this.cooldown > 0) return;

    // 방향: 조준 + 퍼짐(원뿔 내 균일 분포). 반동은 실제 발사 방향의 반대
    const aim = this.player.aimDirection();
    const dir = perturbDirection(aim, this.spread);
    const origin = this.player.eyePosition().addScaledVector(dir, L.muzzleOffset);
    this.projectiles.spawn(origin, dir, L.projectileSpeed, L.projectileMass, L.projectileColor);

    const J = recoilImpulse(L.projectileMass, L.projectileSpeed, L.recoil, L.recoilScale);
    this.player.applyImpulse(dir.clone().multiplyScalar(-J));
    this.lastDeltaV = recoilDeltaV(J, TUNING.player.mass);

    // 연사 퍼짐 누적 + 시점/모델 킥
    this.heat = heatAfterShot(this.heat, L.spread.perShot, L.spread.max);
    const strength = Math.min(1.5, this.lastDeltaV / 8);
    this.player.kick(L.cameraKick * strength, (Math.random() - 0.5) * L.cameraKick * strength);
    this.view.kick(strength);

    this.cooldown = L.fireInterval;
    this.shots++;
  }
}
