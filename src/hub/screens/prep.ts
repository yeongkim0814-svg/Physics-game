import type { BaseId } from '../../core/types';
import { ARMORS } from '../../data/armors';
import { ITEMS } from '../../data/items';
import { PARTS } from '../../data/parts';
import { MATERIAL_ORDER } from '../../data/materials';
import { TUNING } from '../../config/tuning';
import { createInventoryBoard } from '../../inventory/InventoryBoard';
import { armorRows, cmpTable, weaponRows } from '../compare';
import { createItem, hasBroken, isArmor, isWeaponBase, weaponStats } from '../gear';
import { equipArmor, equipWeapon, isBusy, stowPrep, unequip, beginRaid } from '../state';
import type { ScreenFactory } from '../HubShell';
import { button, div } from './dom';
import { allInstances, countOf, type ItemInstance } from '../../inventory/grid';


/**
 * 출격 준비: 창고에서 무기·방어구·재료를 골라 가방 격자에 배치, 장착 상태 확인·부품 비교 후 레이드 입장.
 * 가방과 장착 장비는 사망하면 모두 손실된다. 연구 장비(분석기)는 아지트 전용이라 가방에 못 넣는다.
 */
export const prepScreen: ScreenFactory = (ctx) => {
  const el = div();
  el.appendChild(div('h1', '출격 준비'));
  const row = div('row');
  const side = div('col');
  side.style.cssText = 'flex:1;min-width:300px;max-width:520px';

  const s = ctx.save;
  const board = createInventoryBoard({
    grids: [
      { id: 'stash', title: '창고', grid: s.stash },
      { id: 'bag', title: '가방 (사망 시 손실)', grid: s.prep.bag,
        accepts: (i) => (ITEMS[i.defId].kind === 'equipment' ? '연구 장비는 아지트에서만 쓸 수 있습니다' : null) },
    ],
    locked: (i) => (isBusy(s, i) ? '연구 중인 아이템은 옮길 수 없습니다' : null),
    canDiscard: () => '출격 준비에서는 버릴 수 없습니다 (창고 화면에서)',
    allowDiscard: false,
    onChange: () => { ctx.commit(); renderSide(); },
    onSelect: () => renderSide(),
    extraActions: (sel) => {
      if (!sel || sel.gridId !== 'stash') return [];
      if (isWeaponBase(sel.inst)) return [{ label: '무기 장착', run: () => act(equipWeapon(s, sel.inst.uid)), disabled: false }];
      if (isArmor(sel.inst)) return [{ label: '방어구 장착', run: () => act(equipArmor(s, sel.inst.uid)), disabled: false }];
      return [];
    },
  });

  function act(r: { ok: boolean } | { ok: false; msg: string }) {
    if (!r.ok) { ctx.toast((r as { msg: string }).msg, true); return; }
    ctx.commit();
    board.deselect();
    board.refresh();
    renderSide();
  }

  const weaponCard = (w: ItemInstance) => {
    const base = w.defId as BaseId;
    const bare = weaponStats(createItem(w.defId), false).stats;
    const cur = weaponStats(w).stats;
    const parts = Object.values(w.parts ?? {}).map((p) => p && PARTS[p.defId].name).filter(Boolean).join(', ');
    const c = div('card');
    c.innerHTML = `<b>${ITEMS[w.defId].name}</b> ${hasBroken(w) ? '<span class="tag bad">파손 부품</span>' : ''}<div class="dim">부품: ${parts || '없음'} (맨몸 대비 변화)</div>${cmpTable(weaponRows(base, bare, cur), { onlyChanged: true })}`;
    if (weaponStats(w).disabled) c.innerHTML += '<div class="bad">베이스 내구도 0: 사용 불가 — 작업대에서 수리</div>';
    c.appendChild(button('해제', () => act(unequip(s, { weapon: w.uid })), 'sm'));
    return c;
  };

  function renderSide() {
    side.innerHTML = '';
    side.appendChild(div('h2', `장착 무기 (${s.prep.weapons.length}/${TUNING.hub.weaponSlots})`));
    if (!s.prep.weapons.length) side.appendChild(div('card dim', '창고에서 무기를 선택해 "무기 장착"'));
    for (const w of s.prep.weapons) side.appendChild(weaponCard(w));
    side.appendChild(div('h2', '방어구'));
    for (const slot of ['body', 'aux'] as const) {
      const a = s.prep.armor[slot];
      const c = div('card', `<span class="tag">${slot === 'body' ? '몸통' : '보조'}</span>${a ? `<b>${ITEMS[a.defId].name}</b>${(a.dur ?? 0) <= 0 ? ' <span class="bad">(파손)</span>' : ''}${cmpTable(armorRows(a), {})}` : '<span class="dim">비어 있음</span>'}`);
      if (a) c.appendChild(button('해제', () => act(unequip(s, { armor: slot })), 'sm'));
      side.appendChild(c);
    }

    // 선택한 창고 아이템 vs 장착 중 비교
    const sel = board.selected();
    if (sel && sel.gridId === 'stash') {
      if (isWeaponBase(sel.inst)) {
        const same = s.prep.weapons.find((w) => w.defId === sel.inst.defId) ?? s.prep.weapons[0];
        side.appendChild(div('h2', `비교: ${ITEMS[sel.inst.defId].name} 선택`));
        if (same && same.defId === sel.inst.defId) {
          side.appendChild(div('card', `<div class="dim">장착 중인 ${ITEMS[same.defId].name} → 선택한 무기</div>${cmpTable(weaponRows(same.defId as BaseId, weaponStats(same).stats, weaponStats(sel.inst).stats))}`));
        } else side.appendChild(div('card dim', '같은 베이스를 장착 중이지 않아 비교할 수 없습니다'));
      } else if (isArmor(sel.inst)) {
        const slot = ARMORS[sel.inst.defId].slot;
        const eq = s.prep.armor[slot];
        side.appendChild(div('h2', `비교: ${ITEMS[sel.inst.defId].name} 선택`));
        side.appendChild(div('card', `<div class="dim">${eq ? `장착 중인 ${ITEMS[eq.defId].name} → 선택한 방어구` : '장착 없음 → 선택한 방어구'}</div>${cmpTable(armorRows(eq, sel.inst))}`));
      }
    }

    // 출격 요약
    side.appendChild(div('h2', '출격'));
    const ammo = MATERIAL_ORDER.map((id) => `${ITEMS[id].name} ${countOf(s.prep.bag, id)}`).join(' · ');
    const warns: string[] = [];
    if (!s.prep.weapons.length) warns.push('무기를 1개 이상 장착하세요');
    if (s.prep.weapons.some((w) => weaponStats(w).disabled)) warns.push('내구도 0 무기가 있습니다');
    if (MATERIAL_ORDER.reduce((a, id) => a + countOf(s.prep.bag, id), 0) < TUNING.raid.minKitTotal) warns.push(`탄(재료)이 ${TUNING.raid.minKitTotal}개 미만이면 보급 ${ITEMS[TUNING.raid.rationMaterial].name}로 채워집니다`);
    const safeN = allInstances(s.safe).length;
    side.appendChild(div('card', `<div>가방 탄: ${ammo}</div><div class="dim">안전 보관함 ${safeN}개 — 레이드에서 얻은 것만 새로 넣을 수 있고, 사망해도 유지됩니다</div>${warns.map((w) => `<div class="warn">⚠ ${w}</div>`).join('')}`));
    const go = div('row');
    go.appendChild(button('출격 ➤', () => {
      const r = beginRaid(s, ctx.now());
      if (!r.ok) { ctx.toast(r.msg, true); return; }
      ctx.commit();
      ctx.launchRaid();
    }, 'pri', !s.prep.weapons.length));
    go.appendChild(button('모두 창고로', () => {
      const r = stowPrep(s);
      ctx.commit(); board.deselect(); board.refresh(); renderSide();
      ctx.toast(r.left ? `${r.moved}개 반납, ${r.left}개는 창고 공간이 부족` : `${r.moved}개를 창고로 되돌림`, r.left > 0);
    }, 'sm'));
    side.appendChild(go);
  }

  row.append(board.el, side);
  el.appendChild(row);
  renderSide();
  return { el, refresh: () => { board.refresh(); renderSide(); }, dispose: () => board.destroy() };
};
