import type { BaseId } from '../../core/types';
import { ARMORS, ARMOR_SLOTS } from '../../data/armors';
import { BASES } from '../../data/bases';
import { CONTAINERS } from '../../data/containers';
import { ITEMS } from '../../data/items';
import { PARTS } from '../../data/parts';
import { MATERIAL_ORDER } from '../../data/materials';
import { CLASS_LABEL, WEAPON_SLOTS } from '../../data/weaponSlots';
import { TUNING } from '../../config/tuning';
import { createInventoryBoard, type BoardGrid, type BoardHandle } from '../../inventory/InventoryBoard';
import { allInstances, countOfAll, makeGrid, type Grid, type ItemInstance } from '../../inventory/grid';
import { armorRows, cmpTable, weaponRows } from '../compare';
import { armorList, carryGrids, weaponList } from '../equip';
import { createItem, hasBroken, isArmor, isWeaponBase, weaponStats } from '../gear';
import { isBusy, safeBoxRejects, stowPrep, beginRaid } from '../state';
import type { ScreenFactory } from '../HubShell';
import { button, div } from './dom';

type SlotId = 'helmet' | 'body' | 'vest' | 'backpack' | 'primary1' | 'primary2' | 'secondary' | 'melee';
const AREA: Record<SlotId, BoardGrid['slot'] & object> = {
  helmet: { label: '헬멧', glyph: '◠', area: 'helmet' },
  body: { label: '방어구', glyph: '▛▜', area: 'body' },
  vest: { label: '조끼', glyph: '▤', area: 'vest' },
  backpack: { label: '가방', glyph: '▣', area: 'backpack' },
  primary1: { label: '주 무기', glyph: '╤═', area: 'p1' },
  primary2: { label: '주 무기(등)', glyph: '╤═', area: 'p2' },
  secondary: { label: '보조 무기', glyph: '╤', area: 'sec' },
  melee: { label: '근접 무기', glyph: '†', area: 'melee' },
};
const SLOT_IDS = Object.keys(AREA) as SlotId[];

/**
 * 출격 준비 (Arena Breakout 식): 왼쪽 장비 칸(헬멧·방어구·조끼·가방, 주무기 2·보조무기·근접무기) + 주머니/조끼/가방 격자 + 금고,
 * 오른쪽 창고. 조끼·가방은 장착하면 그 크기의 격자를 제공하고, 내용물을 비워야 벗을 수 있다. 장착 장비·들고 간 것은 사망하면 손실.
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
  const slot = Object.fromEntries(SLOT_IDS.map((id) => [id, makeGrid(4, 4)])) as Record<SlotId, Grid>;
  const inSlot = (id: SlotId): ItemInstance | undefined =>
    (WEAPON_SLOTS.some((w) => w.id === id) ? s.prep.weapons[id as 'primary1'] : id === 'helmet' || id === 'body' ? s.prep.armor[id] : s.prep.containers[id as 'vest']);
  const loadSlots = () => { for (const id of SLOT_IDS) { const i = inSlot(id); slot[id].placed = i ? [{ inst: i, x: 0, y: 0, rot: false }] : []; } };
  const signature = () => `${s.prep.containers.vest?.defId}|${s.prep.containers.backpack?.defId}`;
  const syncBack = () => {
    const get = (id: SlotId) => slot[id].placed[0]?.inst;
    s.prep.weapons = {};
    for (const w of WEAPON_SLOTS) { const i = get(w.id); if (i) s.prep.weapons[w.id] = i; }
    s.prep.armor = {};
    for (const k of ARMOR_SLOTS) { const i = get(k); if (i) s.prep.armor[k] = i; }
    for (const k of ['vest', 'backpack'] as const) {
      const i = get(k);
      const prev = s.prep.containers[k];
      if (i) { s.prep.containers[k] = i; if (!s.prep.carry[k] || prev?.defId !== i.defId) s.prep.carry[k] = makeGrid(CONTAINERS[i.defId].w, CONTAINERS[i.defId].h); }
      else { delete s.prep.containers[k]; s.prep.carry[k] = null; }
    }
  };
  loadSlots();

  const slotAccepts = (id: SlotId) => (i: ItemInstance): string | null => {
    const w = WEAPON_SLOTS.find((x) => x.id === id);
    if (w) {
      if (!isWeaponBase(i)) return '무기 베이스만 장착할 수 있습니다';
      return BASES[i.defId as BaseId].slotClass === w.cls ? null : `${CLASS_LABEL[BASES[i.defId as BaseId].slotClass]}는 이 칸에 들어가지 않습니다 (${CLASS_LABEL[w.cls]} 칸)`;
    }
    if (id === 'helmet' || id === 'body') return isArmor(i) && ARMORS[i.defId].slot === id ? null : `${AREA[id].label} 전용 칸입니다`;
    return CONTAINERS[i.defId]?.slot === id ? null : `${AREA[id].label} 전용 칸입니다`;
  };
  const slotTake = (id: SlotId) => (): string | null =>
    (id === 'vest' || id === 'backpack') && s.prep.carry[id]?.placed.length ? '내용물을 먼저 비우세요' : null;

  const noEquipment = (i: ItemInstance) => (ITEMS[i.defId].kind === 'equipment' ? '연구 장비는 아지트에서만 쓸 수 있습니다' : null);

  let board: BoardHandle;
  function buildBoard(): BoardHandle {
    const grids: BoardGrid[] = [
      ...SLOT_IDS.map((id): BoardGrid => ({ id, title: AREA[id].label, grid: slot[id], accepts: slotAccepts(id), canTake: slotTake(id), slot: AREA[id] })),
      { id: 'stash', title: '창고', grid: s.stash, side: 'right' },
      { id: 'pockets', title: '주머니', grid: s.prep.carry.pockets, accepts: noEquipment },
    ];
    if (s.prep.carry.vest) grids.push({ id: 'vest-grid', title: `조끼 (${ITEMS[s.prep.containers.vest!.defId].name})`, grid: s.prep.carry.vest, accepts: noEquipment });
    if (s.prep.carry.backpack) grids.push({ id: 'pack-grid', title: `가방 (${ITEMS[s.prep.containers.backpack!.defId].name})`, grid: s.prep.carry.backpack, accepts: noEquipment });
    grids.push({ id: 'safe', title: '금고 (안전 보관함)', grid: s.safe, note: '획득품만', accepts: (i) => safeBoxRejects(i) });
    return createInventoryBoard({
      layout: 'loadout',
      grids,
      locked: (i) => (isBusy(s, i) ? '연구 중인 아이템은 옮길 수 없습니다' : null),
      canDiscard: () => '출격 준비에서는 버릴 수 없습니다 (창고 화면에서)',
      onChange: () => {
        const before = signature();
        syncBack();
        ctx.commit();
        if (signature() !== before) rebuild(); else renderSide();
      },
      onSelect: () => renderSide(),
    });
  }
  function rebuild() {
    const old = board;
    board = buildBoard();
    row.replaceChild(board.el, old.el);
    old.destroy();
    renderSide();
  }
  board = buildBoard();

  const weaponCard = (w: ItemInstance) => {
    const base = w.defId as BaseId;
    const bare = weaponStats(createItem(w.defId), false).stats;
    const cur = weaponStats(w).stats;
    const parts = Object.values(w.parts ?? {}).map((p) => p && PARTS[p.defId].name).filter(Boolean).join(', ');
    const c = div('card');
    c.innerHTML = `<b>${ITEMS[w.defId].name}</b> <span class="tag">${CLASS_LABEL[BASES[base].slotClass]}</span> ${hasBroken(w) ? '<span class="tag bad">파손 부품</span>' : ''}<div class="dim">부품: ${parts || '없음'} (맨몸 대비 변화)</div>${cmpTable(weaponRows(base, bare, cur), { onlyChanged: true })}`;
    if (weaponStats(w).disabled) c.innerHTML += '<div class="bad">베이스 내구도 0: 사용 불가 — 작업대에서 수리</div>';
    return c;
  };

  function renderSide() {
    side.innerHTML = '';
    const weapons = weaponList(s.prep);
    side.appendChild(div('h2', `장착 상태 (무기 ${weapons.length}/${WEAPON_SLOTS.length})`));
    if (!weapons.length) side.appendChild(div('card dim', '무기 칸에 창고의 무기를 놓으세요 (무기 선택 → 맞는 칸 탭, 또는 자동 배치)'));
    for (const w of weapons) side.appendChild(weaponCard(w));
    for (const a of armorList(s.prep)) {
      side.appendChild(div('card', `<span class="tag">${ARMORS[a.defId].slot === 'helmet' ? '헬멧' : '방어구'}</span><b>${ITEMS[a.defId].name}</b>${(a.dur ?? 0) <= 0 ? ' <span class="bad">(파손)</span>' : ''}${cmpTable(armorRows(a), {})}`));
    }

    // 선택한 창고 아이템 vs 장착 중 비교
    const sel = board.selected();
    if (sel && sel.gridId === 'stash') {
      const title = div('h2', `비교: ${ITEMS[sel.inst.defId].name} 선택`);
      if (isWeaponBase(sel.inst)) {
        const same = weapons.find((w) => w.defId === sel.inst.defId);
        side.appendChild(title);
        side.appendChild(same
          ? div('card', `<div class="dim">장착 중인 ${ITEMS[same.defId].name} → 선택한 무기</div>${cmpTable(weaponRows(same.defId as BaseId, weaponStats(same).stats, weaponStats(sel.inst).stats))}`)
          : div('card dim', '같은 베이스를 장착 중이지 않아 비교할 수 없습니다'));
      } else if (isArmor(sel.inst)) {
        const eq = s.prep.armor[ARMORS[sel.inst.defId].slot];
        side.appendChild(title);
        side.appendChild(div('card', `<div class="dim">${eq ? `장착 중인 ${ITEMS[eq.defId].name} → 선택한 방어구` : '장착 없음 → 선택한 방어구'}</div>${cmpTable(armorRows(eq, sel.inst))}`));
      } else if (CONTAINERS[sel.inst.defId]) {
        const d = CONTAINERS[sel.inst.defId];
        const eq = s.prep.containers[d.slot];
        side.appendChild(title);
        side.appendChild(div('card', `<div>격자 ${d.w}×${d.h} = ${d.w * d.h}칸</div><div class="dim">${eq ? `장착 중: ${ITEMS[eq.defId].name} ${CONTAINERS[eq.defId].w * CONTAINERS[eq.defId].h}칸` : '장착 없음'}</div>`));
      }
    }

    // 출격 요약
    side.appendChild(div('h2', '출격'));
    const carry = carryGrids(s.prep.carry);
    const ammo = MATERIAL_ORDER.map((id) => `${ITEMS[id].name} ${countOfAll(carry, id)}`).join(' · ');
    const cells = carry.reduce((n, g) => n + g.w * g.h, 0);
    const warns: string[] = [];
    if (!weapons.length) warns.push('무기를 1개 이상 장착하세요');
    if (weapons.some((w) => weaponStats(w).disabled)) warns.push('내구도 0 무기가 있습니다');
    if (!s.prep.containers.vest && !s.prep.containers.backpack) warns.push('조끼·가방이 없어 주머니(4칸)만 쓸 수 있습니다');
    if (MATERIAL_ORDER.reduce((a, id) => a + countOfAll(carry, id), 0) < TUNING.raid.minKitTotal) warns.push(`탄(재료)이 ${TUNING.raid.minKitTotal}개 미만이면 보급 ${ITEMS[TUNING.raid.rationMaterial].name}로 채워집니다`);
    const safeN = allInstances(s.safe).length;
    side.appendChild(div('card', `<div>가져갈 칸 ${cells}칸 · 탄: ${ammo}</div><div class="dim">금고 ${safeN}개 — 레이드에서 얻은 것만 새로 넣을 수 있고, 사망해도 유지됩니다</div>${warns.map((w) => `<div class="warn">⚠ ${w}</div>`).join('')}`));
    const go = div('row');
    go.appendChild(button('출격 ➤', () => {
      const r = beginRaid(s, ctx.now());
      if (!r.ok) { ctx.toast(r.msg, true); return; }
      ctx.commit();
      ctx.launchRaid();
    }, 'pri', !weapons.length));
    go.appendChild(button('모두 창고로', () => {
      const r = stowPrep(s);
      loadSlots();
      ctx.commit();
      rebuild();
      ctx.toast(r.left ? `${r.moved}개 반납, ${r.left}개는 창고 공간이 부족` : `${r.moved}개를 창고로 되돌림`, r.left > 0);
    }, 'sm'));
    side.appendChild(go);
  }

  row.append(board.el, side);
  el.appendChild(row);
  renderSide();
  return { el, refresh: () => { loadSlots(); rebuild(); }, dispose: () => board.destroy() };
};
