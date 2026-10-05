import type { BaseId } from '../../core/types';
import { ARMORS } from '../../data/armors';
import { ITEMS } from '../../data/items';
import { PARTS } from '../../data/parts';
import { MATERIAL_ORDER } from '../../data/materials';
import { TUNING } from '../../config/tuning';
import { createInventoryBoard } from '../../inventory/InventoryBoard';
import { armorRows, cmpTable, weaponRows } from '../compare';
import { createItem, hasBroken, isArmor, isWeaponBase, weaponStats } from '../gear';
import { isBusy, safeBoxRejects, stowPrep, beginRaid } from '../state';
import type { ScreenFactory } from '../HubShell';
import { button, div } from './dom';
import { allInstances, countOf, makeGrid, type ItemInstance } from '../../inventory/grid';


/**
 * 출격 준비: 창고에서 무기·방어구·재료를 골라 가방 격자에 배치, 장착 상태 확인·부품 비교 후 레이드 입장.
 * 가방과 장착 장비는 사망하면 모두 손실된다. 연구 장비(분석기)는 아지트 전용이라 가방에 못 넣는다.
 */
export const prepScreen: ScreenFactory = (ctx) => {
  const el = div();
  el.appendChild(div('h1', '출격 준비'));
  const row = div('row');
  row.style.alignItems = 'flex-start';
  const side = div('col');
  side.style.cssText = 'flex:1;min-width:280px;max-width:420px';

  const s = ctx.save;
  // 장비 칸은 어댑터 격자(아이템 1개)로 보드에 올리고, 변경되면 prep 구조로 되돌려 쓴다
  const mkSlot = () => makeGrid(4, 4);
  const slot = { w1: mkSlot(), w2: mkSlot(), body: mkSlot(), aux: mkSlot() };
  const setSlot = (g: ReturnType<typeof makeGrid>, inst?: ItemInstance) => { g.placed = inst ? [{ inst, x: 0, y: 0, rot: false }] : []; };
  const loadSlots = () => {
    setSlot(slot.w1, s.prep.weapons[0]); setSlot(slot.w2, s.prep.weapons[1]);
    setSlot(slot.body, s.prep.armor.body); setSlot(slot.aux, s.prep.armor.aux);
  };
  const syncBack = () => {
    s.prep.weapons = [slot.w1, slot.w2].map((g) => g.placed[0]?.inst).filter((x): x is ItemInstance => !!x);
    s.prep.armor = {};
    if (slot.body.placed[0]) s.prep.armor.body = slot.body.placed[0].inst;
    if (slot.aux.placed[0]) s.prep.armor.aux = slot.aux.placed[0].inst;
  };
  loadSlots();

  const weaponOnly = (i: ItemInstance) => (isWeaponBase(i) ? null : '무기 베이스만 장착할 수 있습니다');
  const armorFor = (kind: 'body' | 'aux') => (i: ItemInstance) =>
    !isArmor(i) ? '방어구만 장착할 수 있습니다' : ARMORS[i.defId].slot === kind ? null : `${kind === 'body' ? '몸통' : '보조'} 방어구가 아닙니다`;

  const board = createInventoryBoard({
    layout: 'loadout',
    grids: [
      { id: 'w1', title: '주 무기', grid: slot.w1, accepts: weaponOnly, slot: { label: '주 무기', glyph: '╤═', area: 'w1' } },
      { id: 'w2', title: '보조 무기', grid: slot.w2, accepts: weaponOnly, slot: { label: '보조 무기', glyph: '╤', area: 'w2' } },
      { id: 'body', title: '몸통 방어구', grid: slot.body, accepts: armorFor('body'), slot: { label: '몸통 방어구', glyph: '▛▜', area: 'body' } },
      { id: 'aux', title: '보조 방어구', grid: slot.aux, accepts: armorFor('aux'), slot: { label: '보조 방어구', glyph: '▭', area: 'aux' } },
      { id: 'stash', title: '창고', grid: s.stash, side: 'right' },
      { id: 'bag', title: '가방 (사망 시 손실)', grid: s.prep.bag,
        accepts: (i) => (ITEMS[i.defId].kind === 'equipment' ? '연구 장비는 아지트에서만 쓸 수 있습니다' : null) },
      { id: 'safe', title: '금고 (안전 보관함)', grid: s.safe, note: '획득품만',
        accepts: (i) => safeBoxRejects(i) },
    ],
    locked: (i) => (isBusy(s, i) ? '연구 중인 아이템은 옮길 수 없습니다' : null),
    canDiscard: () => '출격 준비에서는 버릴 수 없습니다 (창고 화면에서)',
    onChange: () => { syncBack(); ctx.commit(); renderSide(); },
    onSelect: () => renderSide(),
  });

  const weaponCard = (w: ItemInstance) => {
    const base = w.defId as BaseId;
    const bare = weaponStats(createItem(w.defId), false).stats;
    const cur = weaponStats(w).stats;
    const parts = Object.values(w.parts ?? {}).map((p) => p && PARTS[p.defId].name).filter(Boolean).join(', ');
    const c = div('card');
    c.innerHTML = `<b>${ITEMS[w.defId].name}</b> ${hasBroken(w) ? '<span class="tag bad">파손 부품</span>' : ''}<div class="dim">부품: ${parts || '없음'} (맨몸 대비 변화)</div>${cmpTable(weaponRows(base, bare, cur), { onlyChanged: true })}`;
    if (weaponStats(w).disabled) c.innerHTML += '<div class="bad">베이스 내구도 0: 사용 불가 — 작업대에서 수리</div>';
    return c;
  };

  function renderSide() {
    side.innerHTML = '';
    side.appendChild(div('h2', `장착 상태 (무기 ${s.prep.weapons.length}/${TUNING.hub.weaponSlots})`));
    if (!s.prep.weapons.length) side.appendChild(div('card dim', '무기 칸에 창고의 무기를 놓으세요 (무기 선택 → 무기 칸 탭, 또는 자동 배치)'));
    for (const w of s.prep.weapons) side.appendChild(weaponCard(w));
    for (const slotKey of ['body', 'aux'] as const) {
      const a = s.prep.armor[slotKey];
      if (!a) continue;
      side.appendChild(div('card', `<span class="tag">${slotKey === 'body' ? '몸통' : '보조'}</span><b>${ITEMS[a.defId].name}</b>${(a.dur ?? 0) <= 0 ? ' <span class="bad">(파손)</span>' : ''}${cmpTable(armorRows(a), {})}`));
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
        const eq = s.prep.armor[ARMORS[sel.inst.defId].slot];
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
    side.appendChild(div('card', `<div>가방 탄: ${ammo}</div><div class="dim">금고 ${safeN}개 — 레이드에서 얻은 것만 새로 넣을 수 있고, 사망해도 유지됩니다</div>${warns.map((w) => `<div class="warn">⚠ ${w}</div>`).join('')}`));
    const go = div('row');
    go.appendChild(button('출격 ➤', () => {
      const r = beginRaid(s, ctx.now());
      if (!r.ok) { ctx.toast(r.msg, true); return; }
      ctx.commit();
      ctx.launchRaid();
    }, 'pri', !s.prep.weapons.length));
    go.appendChild(button('모두 창고로', () => {
      const r = stowPrep(s);
      loadSlots();
      ctx.commit(); board.deselect(); board.refresh(); renderSide();
      ctx.toast(r.left ? `${r.moved}개 반납, ${r.left}개는 창고 공간이 부족` : `${r.moved}개를 창고로 되돌림`, r.left > 0);
    }, 'sm'));
    side.appendChild(go);
  }

  row.append(board.el, side);
  el.appendChild(row);
  renderSide();
  return { el, refresh: () => { loadSlots(); board.refresh(); renderSide(); }, dispose: () => board.destroy() };
};
