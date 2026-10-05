import { TUNING } from '../../config/tuning';
import { onTap } from '../../ui/tap';
import { ITEMS } from '../../data/items';
import { NODE_BY_ID } from '../../data/knowledge';
import { UPGRADES, UPGRADE_BY_ID, type UpgradeDef } from '../../data/upgrades';
import { allInstances, cloneInst, type ItemInstance } from '../../inventory/grid';
import { armorRows, cmpTable, weaponRows } from '../compare';
import { armorStatsOf, isArmor, isWeaponBase, levelOf, upgradeApplies, weaponStats } from '../gear';
import { findItem, isUnlocked, researchStatus, startResearch } from '../state';
import { fmtTime, type ScreenFactory } from '../HubShell';
import { button, costHtml, div, jobBar, pickList, tickTimers, timerHtml } from './dom';
import type { BaseId } from '../../core/types';

interface Cand { inst: ItemInstance; parent?: ItemInstance }

/** 연구대: 일반 재료 + 해금된 노드 → 베이스·부품·방어구의 개량(능력치·마모율·장단점 변화). 노드 "깊이"를 키우는 경로 */
export const researchScreen: ScreenFactory = (ctx) => {
  const el = div();
  let selUid: string | null = null;
  let selUp: string | null = null;

  const candidates = (): Cand[] => {
    const out: Cand[] = [];
    for (const i of allInstances(ctx.save.stash)) {
      if (UPGRADES.some((u) => upgradeApplies(u.id, i))) out.push({ inst: i });
      for (const p of Object.values(i.parts ?? {})) if (p && UPGRADES.some((u) => upgradeApplies(u.id, p))) out.push({ inst: p, parent: i });
    }
    return out;
  };

  /** 개량 후 비교용: 루트(무기 또는 방어구)의 복제본에서 대상 레벨만 올린다 */
  function previewTable(c: Cand, u: UpgradeDef, to: number): string {
    const root = c.parent ?? c.inst;
    if (!(isWeaponBase(root) || isArmor(root))) return '';
    const after = cloneInst(root);
    const target = after.uid === c.inst.uid ? after : Object.values(after.parts ?? {}).find((p) => p?.uid === c.inst.uid)!;
    target.lv = { ...(target.lv ?? {}), [u.id]: to };
    if (isArmor(root)) return cmpTable(armorRows(root, after), { onlyChanged: true });
    return cmpTable(weaponRows(root.defId as BaseId, weaponStats(root).stats, weaponStats(after).stats), { onlyChanged: true });
  }

  function render() {
    const s = ctx.save, now = ctx.now();
    el.innerHTML = '';
    el.appendChild(div('h1', '연구대'));

    if (s.research) {
      const item = findItem(s, s.research.itemUid);
      el.appendChild(div('card', `<div>연구 중: <b>${item ? ITEMS[item.defId].name : '?'}</b> · ${UPGRADE_BY_ID[s.research.upgradeId].name} → Lv${s.research.toLevel} · 남은 ${timerHtml('research', s, now)}</div>${jobBar('research', s, now)}<div class="dim">연구 중인 아이템은 창고에서 옮기거나 출격에 쓸 수 없습니다. 다른 화면은 자유롭게 쓸 수 있습니다.</div>`));
    }

    const row = div('row');
    row.style.marginTop = '8px';
    const left = div('col');
    left.style.cssText = 'flex:1;min-width:240px;max-width:340px';
    left.appendChild(div('h2', '대상 (창고)'));
    const cands = candidates();
    left.appendChild(pickList(cands, (c) => {
      const lv = Object.entries(c.inst.lv ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${UPGRADE_BY_ID[k]?.name} Lv${v}`).join(', ');
      return `<b>${c.parent ? '↳ ' : ''}${ITEMS[c.inst.defId].name}</b>${c.parent ? ` <span class="dim">(${ITEMS[c.parent.defId].name} 장착)</span>` : ''}<div class="dim">${lv || '개량 없음'}</div>`;
    }, (c) => c.inst.uid === selUid, (c) => { selUid = c.inst.uid; selUp = null; render(); }, '개량할 수 있는 무기·부품·방어구가 창고에 없습니다'));
    row.appendChild(left);

    const right = div('col');
    right.style.cssText = 'flex:2;min-width:320px';
    right.appendChild(div('h2', '개량'));
    const cand = cands.find((c) => c.inst.uid === selUid);
    if (!cand) right.appendChild(div('dim', '왼쪽에서 대상을 고르세요'));
    else {
      const ups = UPGRADES.filter((u) => upgradeApplies(u.id, cand.inst));
      const locked = ups.filter((u) => !isUnlocked(s, u.node)).length;
      for (const u of ups.filter((x) => isUnlocked(s, x.node))) {
        const lv = levelOf(cand.inst, u.id);
        const card = div(`card${selUp === u.id ? ' sel' : ''}`);
        card.innerHTML = `<b>${u.name}</b> <span class="tag">Lv ${lv}/${u.maxLevel}</span><span class="tag">${NODE_BY_ID[u.node].name}</span>
          <div class="good">+ ${u.pros}</div><div class="bad">− ${u.cons}</div>`;
        card.style.cursor = 'pointer';
        onTap(card, () => { selUp = u.id; render(); });
        if (selUp === u.id) {
          if (lv >= u.maxLevel) card.appendChild(div('dim', '최대 레벨'));
          else {
            const st = researchStatus(s, cand.inst.uid, u.id);
            card.appendChild(div('', `<div class="dim">Lv${lv + 1} 비용 (창고 재료)</div>${costHtml(s.stash, u.cost[lv])}<span class="tag">소요 ${fmtTime(u.seconds[lv] * 1000 * TUNING.hub.timeScale)}</span>`));
            card.appendChild(div('', previewTable(cand, u, lv + 1)));
            const b = button('연구 시작', () => {
              const r = startResearch(s, cand.inst.uid, u.id, ctx.now());
              if (!r.ok) { ctx.toast(r.msg, true); return; }
              ctx.commit(); ctx.toast('연구를 시작했습니다'); render();
            }, 'pri', !st.ok);
            card.appendChild(b);
            if (!st.ok) card.appendChild(div('bad', st.msg));
          }
        }
        right.appendChild(card);
      }
      if (locked) right.appendChild(div('card lock', `잠긴 개량 ${locked}개 — 지식 노드를 더 해금하면 열립니다`));
      if (isArmor(cand.inst)) {
        const a = armorStatsOf(cand.inst);
        right.appendChild(div('dim', `현재 속도 ×${a.speedMul.toFixed(2)}`));
      }
    }
    row.appendChild(right);
    el.appendChild(row);
  }
  render();
  return { el, refresh: render, tick: () => tickTimers(el, ctx.save, ctx.now()) };
};
