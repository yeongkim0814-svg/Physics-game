import type { BaseId, SlotKind } from '../../core/types';
import { ITEMS } from '../../data/items';
import { PARTS } from '../../data/parts';
import { RECIPES } from '../../data/recipes';
import { ACTIVE_SLOTS } from '../../data/loadout';
import { allInstances, cloneInst } from '../../inventory/grid';
import { cmpTable, weaponRows } from '../compare';
import { attachError, attachPart, createItem, durableParts, isPart, isWeaponBase, repairCost, weaponStats } from '../gear';
import { describeItem } from '../itemInfo';
import { attach, craft, craftStatus, detach, isBusy, isUnlocked, repair } from '../state';
import type { ScreenFactory } from '../HubShell';
import { bar, button, costHtml, div, pickList } from './dom';

type Mode = 'craft' | 'attach' | 'repair';
const SLOT_LABEL: Record<SlotKind, string> = { front: '전방', rear: '후방', top: '상단', sub: '부전공' };

/** 작업대: 재료 + 해금된 레시피 → 제작, 부품 장착/분리, 수리 (내구도 0 수리는 여기서만) */
export const workbenchScreen: ScreenFactory = (ctx) => {
  const el = div();
  let mode: Mode = 'craft';
  let weaponUid: string | null = null;

  const stashItems = () => allInstances(ctx.save.stash);

  function craftView(box: HTMLElement) {
    const s = ctx.save;
    const open = RECIPES.filter((r) => !r.node || isUnlocked(s, r.node));
    const lockedN = RECIPES.length - open.length;
    for (const r of open) {
      const st = craftStatus(s, r.id);
      const d = ITEMS[r.out];
      const info = describeItem(createItem(r.out));
      const c = div('card');
      c.innerHTML = `<b>${d.name}</b> <span class="tag">${d.w}×${d.h}</span><div class="dim">${info.lines.slice(1).join(' · ')}</div><div>${costHtml(s.stash, r.cost)}</div>`;
      c.appendChild(button('제작', () => {
        const res = craft(s, r.id);
        if (!res.ok) { ctx.toast(res.msg, true); return; }
        ctx.commit(); ctx.toast(`${d.name} 제작 완료 (창고)`); render();
      }, 'sm pri', !st.ok));
      box.appendChild(c);
    }
    if (lockedN) box.appendChild(div('card lock', `잠긴 레시피 ${lockedN}개 — 지식 노드를 해금하면 열립니다`));
  }

  function attachView(box: HTMLElement) {
    const s = ctx.save;
    const weapons = stashItems().filter(isWeaponBase);
    const row = div('row');
    const left = div('col');
    left.style.cssText = 'flex:1;min-width:220px;max-width:300px';
    left.appendChild(div('h2', '무기 (창고)'));
    left.appendChild(pickList(weapons, (w) => `<b>${ITEMS[w.defId].name}</b><div class="dim">${Object.values(w.parts ?? {}).map((p) => p && PARTS[p.defId].name).join(', ') || '부품 없음'}</div>`,
      (w) => w.uid === weaponUid, (w) => { weaponUid = w.uid; render(); }, '창고에 무기가 없습니다'));
    row.appendChild(left);

    const right = div('col');
    right.style.cssText = 'flex:2;min-width:320px';
    const w = weapons.find((x) => x.uid === weaponUid);
    right.appendChild(div('h2', '부품 슬롯'));
    if (!w) right.appendChild(div('dim', '왼쪽에서 무기를 고르세요'));
    else {
      const base = w.defId as BaseId;
      const cur = weaponStats(w).stats;
      for (const slot of ACTIVE_SLOTS) {
        const part = w.parts?.[slot];
        const c = div('card');
        c.innerHTML = `<b>${SLOT_LABEL[slot]} 슬롯</b>: ${part ? `${PARTS[part.defId].name} <span class="dim">(${part.dur !== undefined ? `내구도 ${Math.ceil(part.dur)}` : '내구도 없음'})</span>` : '<span class="dim">비어 있음</span>'}`;
        if (part) c.appendChild(button('분리', () => {
          const r = detach(s, w.uid, slot);
          if (!r.ok) { ctx.toast(r.msg, true); return; }
          ctx.commit(); render();
        }, 'sm'));
        // 이 슬롯에 맞는 창고 부품
        const options = stashItems().filter((p) => isPart(p) && PARTS[p.defId].slot === slot);
        for (const p of options) {
          const err = attachError(w, p);
          const row2 = div('', `<div style="margin-top:6px"><b>${ITEMS[p.defId].name}</b> ${err ? `<span class="bad">${err}</span>` : ''}</div>`);
          if (!err) {
            const after = cloneInst(w);
            attachPart(after, cloneInst(p));
            row2.appendChild(div('', cmpTable(weaponRows(base, cur, weaponStats(after).stats), { onlyChanged: true })));
          }
          row2.appendChild(button(part ? '교체' : '장착', () => {
            const r = attach(s, w.uid, p.uid);
            if (!r.ok) { ctx.toast(r.msg, true); return; }
            ctx.commit(); ctx.toast(`${ITEMS[p.defId].name} 장착`); render();
          }, 'sm pri', !!err || isBusy(s, p) || isBusy(s, w)));
          c.appendChild(row2);
        }
        if (!options.length) c.appendChild(div('dim', '맞는 부품이 창고에 없습니다'));
        right.appendChild(c);
      }
    }
    row.appendChild(right);
    box.appendChild(row);
  }

  function repairView(box: HTMLElement) {
    const s = ctx.save;
    const list = stashItems().filter((i) => repairCost(i));
    box.appendChild(div('dim', '창고에 있는 장비만 수리됩니다 (출격 준비에 올린 장비는 먼저 창고로). 내구도 0(파손)은 추가 재료가 듭니다.'));
    if (!list.length) box.appendChild(div('card', '수리할 장비가 없습니다'));
    for (const it of list) {
      const cost = repairCost(it)!;
      const c = div('card');
      c.innerHTML = `<b>${ITEMS[it.defId].name}</b>`;
      for (const part of durableParts(it)) {
        const broken = (part.inst.dur ?? 0) <= 0;
        c.innerHTML += `<div class="${broken ? 'bad' : ''}">${part.label} ${Math.ceil(part.inst.dur ?? 0)}/${part.max}${broken ? ' (파손)' : ''}</div>${bar((part.inst.dur ?? 0) / part.max, (part.inst.dur ?? 0) / part.max < 0.25)}`;
      }
      c.innerHTML += `<div>${costHtml(s.stash, cost)}</div>`;
      c.appendChild(button('수리', () => {
        const r = repair(s, it.uid);
        if (!r.ok) { ctx.toast(r.msg, true); return; }
        ctx.commit(); ctx.toast(`${ITEMS[it.defId].name} 수리 완료`); render();
      }, 'sm pri', !Object.entries(cost).every(([id, n]) => stashItems().filter((x) => x.defId === id).reduce((a, x) => a + x.count, 0) >= n)));
      box.appendChild(c);
    }
  }

  function render() {
    el.innerHTML = '';
    el.appendChild(div('h1', '작업대'));
    const tabs = div('row');
    for (const [m, label] of [['craft', '제작'], ['attach', '부품 장착'], ['repair', '수리']] as const) {
      tabs.appendChild(button(label, () => { mode = m; render(); }, `sm${mode === m ? ' pri' : ''}`));
    }
    el.appendChild(tabs);
    const box = div('col');
    box.style.marginTop = '8px';
    if (mode === 'craft') craftView(box); else if (mode === 'attach') attachView(box); else repairView(box);
    el.appendChild(box);
  }
  render();
  return { el, refresh: render };
};
