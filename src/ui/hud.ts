import type { Weapon } from '../weapons/Weapon';

import { TUNING } from '../config/tuning';
import type { PlayerController } from '../player/PlayerController';
import type { Extraction } from '../world/Extraction';
import type { MobManager } from '../mobs/MobManager';
import { GameWorld } from '../world/GameWorld';

/** 게임 중 HUD: 한 줄 요약 모드. 필수 정보만 */
export function makeHudText(
  player: PlayerController, weapon: Weapon, _mobs: MobManager, extraction: Extraction, world: GameWorld,
): string {
  const e = extraction.position;
  const dx = e.x - player.position.x, dz = e.z - player.position.z;
  const d = Math.hypot(dx, dz);
  const rel = Math.atan2(-dx, -dz) - player.yaw;
  const k = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
  const arrow = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'][k];
  const water = extraction.contains(player.position) || !world.isInWater(player.position.x, player.position.z) ? '' : '⚠물';
  
  const hp = `❤ ${Math.ceil(player.hp)}/${TUNING.player.maxHp}`;
  const exit = extraction.contains(player.position) ? '▓탈출중' : `${arrow}${d.toFixed(0)}m${water}`;
  const wpnInfo = weapon.hudLines()[0];
  return `${hp}  |  ${exit}  |  ${wpnInfo}`;
}

export function makeLootText(mobs: MobManager): string {
  return `⚔ ${mobs.kills}  🎒 ${mobs.alive.length}/${mobs.mobs.length}`;
}
