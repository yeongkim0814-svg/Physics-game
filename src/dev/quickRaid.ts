import type { SlotKind } from '../core/types';
import { createItem, attachPart } from '../hub/gear';
import { defaultSave } from '../hub/save';
import { beginRaid, equipArmor, equipWeapon } from '../hub/state';
import { addItem } from '../inventory/grid';
import { PARTS } from '../data/parts';
import { startRaid } from '../raid/RaidLoop';

/**
 * 개발용 빠른 시작 (?dev=raid): 허브를 건너뛰고 두 베이스를 모두 들고 레이드에 들어간다. 저장을 건드리지 않는다.
 * 부품은 ?front=&rear=&top= 으로, 방어구는 ?armor=plate_vest&aux=shin_guard 로, 베이스 순서는 ?base=em_coil 로 지정.
 */
export function startQuickRaid(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const save = defaultSave();
  const launcher = save.stash.placed.find((p) => p.inst.defId === 'momentum_launcher')!.inst;
  const coil = createItem('em_coil');
  addItem(save.stash, coil);
  for (const slot of ['front', 'rear', 'top'] as SlotKind[]) {
    const id = q.get(slot);
    if (!id || !PARTS[id] || PARTS[id].slot !== slot) continue;
    const target = PARTS[id].base === 'em_coil' ? coil : launcher;
    if (!PARTS[id].base || PARTS[id].base === target.defId) attachPart(target, createItem(id));
  }
  const order = q.get('base') === 'em_coil' ? [coil, launcher] : [launcher, coil];
  for (const w of order) equipWeapon(save, w.uid);
  for (const id of [q.get('armor'), q.get('aux')]) if (id) { const a = createItem(id); addItem(save.stash, a); equipArmor(save, a.uid); }
  beginRaid(save, Date.now());
  return startRaid(root, save, { persist: false });
}
