import type { Loadout, SlotKind } from '../core/types';
import { validateLoadout } from './loadout';

/** 프로토타입 시작 상태. 장착 메뉴(T9) 전까지는 이 값 + URL 파라미터로 테스트한다 */
export const START_LOADOUT: Loadout = { base: 'momentum_launcher', parts: {} };
export const START_MATERIALS: Record<string, number> = { slag: 30, scrap: 40, ingot: 6 };

/** 개발용: ?base=em_coil&rear=damping_spring&top=scope&front=focus_coil */
export function loadoutFromUrl(search: string): Loadout {
  const q = new URLSearchParams(search);
  const l: Loadout = { base: (q.get('base') as Loadout['base']) ?? START_LOADOUT.base, parts: {} };
  for (const slot of ['front', 'rear', 'top'] as SlotKind[]) {
    const id = q.get(slot);
    if (id) l.parts[slot] = id;
  }
  return validateLoadout(l).length === 0 ? l : START_LOADOUT;
}
