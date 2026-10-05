import { ITEMS, KIND_LABEL } from '../data/items';
import { PARTS } from '../data/parts';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { RESIST_KINDS, RESIST_LABEL } from '../data/armors';
import { BASES } from '../data/bases';
import type { ItemInstance } from '../inventory/grid';
import { armorStatsOf, durableParts, isArmor } from './gear';

/** 선택한 아이템 설명 (격자 도구줄/각 화면 공용). [제목, 본문 줄들] */
export function describeItem(i: ItemInstance): { title: string; lines: string[] } {
  const d = ITEMS[i.defId];
  const lines: string[] = [`${KIND_LABEL[d.kind]} · ${d.w}×${d.h}${d.stack > 1 ? ` · 스택 ${i.count}/${d.stack}` : ''}`];
  if (d.kind === 'weapon_base' && !BASES[i.defId as keyof typeof BASES].implemented) lines.push('⚠ 레이드 동작 미구현(placeholder)');
  for (const c of durableParts(i)) lines.push(`${c.label} 내구도 ${Math.ceil(c.inst.dur ?? 0)}/${c.max}${(c.inst.dur ?? 0) <= 0 ? ' (파손)' : ''}`);
  const parts = Object.values(i.parts ?? {}).filter((p): p is ItemInstance => !!p).map((p) => PARTS[p.defId]?.name).filter(Boolean);
  if (parts.length) lines.push(`부품: ${parts.join(', ')}`);
  if (isArmor(i)) {
    const a = armorStatsOf(i);
    lines.push(RESIST_KINDS.map((k) => `${RESIST_LABEL[k]} ${Math.round(a.resist[k] * 100)}%`).join(' ') + `  속도 ×${a.speedMul.toFixed(2)}`);
  }
  const lv = Object.entries(i.lv ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${UPGRADE_BY_ID[k]?.name ?? k} Lv${v}`);
  if (lv.length) lines.push(`개량: ${lv.join(', ')}`);
  if (i.found) lines.push('★ 이번 레이드 획득');
  if (d.desc) lines.push(d.desc);
  return { title: d.name, lines };
}
