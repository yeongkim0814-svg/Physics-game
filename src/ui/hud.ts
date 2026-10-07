import { TUNING } from '../config/tuning';
import type { PlayerController } from '../player/PlayerController';
import type { MobManager } from '../mobs/MobManager';
import type { Weapon } from '../weapons/Weapon';
import type { GameWorld } from '../world/GameWorld';

/** 게임 중 HUD 텍스트: 체력 · 속도 · 처치/몹 · 현재 무기 · 물 위 경고 */
export function makeHudText(
  player: PlayerController, weapon: Weapon, mobs: MobManager, world: GameWorld,
  info: { slot: number; slots: number; fps: string },
): string {
  const water = world.isInWater(player.position.x, player.position.z) ? '  [물 위: 누전 위험]' : '';
  return [
    `HP ${Math.ceil(player.hp)}/${TUNING.player.maxHp}   몹 ${mobs.alive.length}/${mobs.mobs.length}  처치 ${mobs.kills}${water}`,
    `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}  ${info.fps}`,
    `무기 ${info.slot}/${info.slots}${info.slots > 1 ? ' (F/WPN 전환)' : ''}`,
    ...weapon.hudLines(),
  ].join('\n');
}
