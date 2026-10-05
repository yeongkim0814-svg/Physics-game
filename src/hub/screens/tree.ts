import { NODES, type KnowledgeNode } from '../../data/knowledge';
import { RECIPES } from '../../data/recipes';
import { UPGRADES } from '../../data/upgrades';
import { ITEMS } from '../../data/items';
import { onTap } from '../../ui/tap';
import { isUnlocked } from '../state';
import type { ScreenFactory } from '../HubShell';
import { div } from './dom';

/**
 * 지식 트리(읽기 전용): 해금된 노드는 내용 표시, 잠긴 노드는 윤곽(?)만.
 * 잠긴 노드의 이름·설명·해금 내용은 물론 샘플 위치 힌트도 주지 않는다 → 직접 탐험하게 하는 설계.
 */
export const treeScreen: ScreenFactory = (ctx) => {
  const el = div();
  let selId: string | null = null;

  function detail(n: KnowledgeNode): string {
    const recipes = RECIPES.filter((r) => r.node === n.id).map((r) => ITEMS[r.out].name);
    const ups = UPGRADES.filter((u) => u.node === n.id).map((u) => u.name);
    return `<div class="h2" style="margin-top:0">${n.name}</div><div>${n.blurb}</div>
      <div class="dim" style="margin-top:6px">무기 베이스: <b>${n.weaponName}</b></div>
      <div class="dim">작업대 레시피: ${recipes.join(', ') || '-'}</div><div class="dim">연구대 개량: ${ups.join(', ') || '-'}</div>`;
  }

  function render() {
    el.innerHTML = '';
    el.appendChild(div('h1', '지식 트리'));
    const have = NODES.filter((n) => isUnlocked(ctx.save, n.id)).length;
    el.appendChild(div('dim', `물리 갈래 · 해금 ${have}/${NODES.length} · 잠긴 노드는 윤곽만 보입니다. 이상 현상 샘플을 분석하면 열립니다.`));

    const map = div('card');
    map.style.cssText = 'position:relative;height:300px;margin-top:8px;overflow:hidden';
    // 연결선
    let lines = '';
    for (const n of NODES) for (const r of n.requires) {
      const a = NODES.find((x) => x.id === r)!;
      const both = isUnlocked(ctx.save, n.id) && isUnlocked(ctx.save, a.id);
      lines += `<line x1="${a.pos.x}" y1="${a.pos.y}" x2="${n.pos.x}" y2="${n.pos.y}" stroke="${both ? '#7fbf6a' : '#3a4430'}" stroke-width="${both ? 0.8 : 0.5}" ${both ? '' : 'stroke-dasharray="1.5 1.5"'} vector-effect="non-scaling-stroke"/>`;
    }
    map.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">${lines}</svg>`;
    for (const n of NODES) {
      const open = isUnlocked(ctx.save, n.id);
      const b = div('', open ? `<b>${n.name}</b><div style="font-size:11px" class="dim">${n.weaponName}</div>` : '<span style="font-size:22px">?</span>');
      b.style.cssText = `position:absolute;left:${n.pos.x}%;top:${n.pos.y}%;transform:translate(-50%,-50%);min-width:96px;min-height:64px;padding:6px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;` +
        (open ? `background:#363d2a;border:2px solid ${selId === n.id ? '#fff' : '#7fbf6a'};cursor:pointer` : 'background:transparent;border:2px dashed #3a4430;color:#3a4430');
      if (open) onTap(b, () => { selId = n.id; render(); });
      map.appendChild(b);
    }
    el.appendChild(map);
    const sel = NODES.find((n) => n.id === selId && isUnlocked(ctx.save, n.id));
    el.appendChild(div('card', sel ? detail(sel) : '<span class="dim">해금된 노드를 탭하면 내용을 봅니다</span>'));
  }
  render();
  return { el, refresh: render };
};
