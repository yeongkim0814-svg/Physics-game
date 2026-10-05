import { BASES } from '../data/bases';
import type { WeaponState } from '../core/types';
import type { Weapon } from './Weapon';

/** 레이드 동작이 아직 없는 베이스(C·D·E)의 대체 무기. 쏘면 아무 일도 일어나지 않고 HUD 에 안내만 표시한다 (이번 범위 밖) */
export class PlaceholderWeapon implements Weapon {
  constructor(public state: WeaponState) {}
  update() { /* 동작 없음 */ }
  hudLines(): string[] {
    return [`${BASES[this.state.loadout.base].name}: placeholder — 레이드 동작 미구현 (WPN 으로 다른 무기 전환)`];
  }
}
