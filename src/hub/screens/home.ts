import { NODES } from '../../data/knowledge';
import { ITEMS } from '../../data/items';
import { UPGRADE_BY_ID } from '../../data/upgrades';
import { countOf, freeCells, allInstances } from '../../inventory/grid';
import { defaultSave } from '../save';
import { analyzerTier, findItem } from '../state';
import type { ScreenFactory } from '../HubShell';
import { button, div, jobBar, timerHtml, tickTimers } from './dom';

/** 허브: 진행 중인 분석·연구 남은 시간과 각 화면 진입 (한눈에 보이는 상태판) */
export const homeScreen: ScreenFactory = (ctx) => {
  const el = div();
  let resetArmed = false;

  function render() {
    const s = ctx.save, now = ctx.now();
    el.innerHTML = '';
    el.appendChild(div('h1', '상태판'));

    const jobs = div('row');
    jobs.style.alignItems = 'stretch';
    // 분석
    const a = div('card');
    a.style.cssText = 'flex:1;min-width:260px';
    a.innerHTML = '<div class="h2" style="margin-top:0">분석기</div>';
    if (s.analysis) {
      a.innerHTML += `<div>샘플 분석 중… 남은 시간 ${timerHtml('analysis', s, now)}</div>${jobBar('analysis', s, now)}<div class="dim">다른 화면을 써도, 앱을 꺼도 진행됩니다</div>`;
    } else a.innerHTML += `<div class="dim">대기 중 · 분석기 ${analyzerTier(s)}단계 · 샘플 ${countOf(s.stash, 'anomaly_sample') + countOf(s.safe, 'anomaly_sample')}개 보유</div>`;
    a.appendChild(button('분석기로', () => ctx.go('analyzer'), 'sm'));
    jobs.appendChild(a);
    // 연구
    const r = div('card');
    r.style.cssText = 'flex:1;min-width:260px';
    r.innerHTML = '<div class="h2" style="margin-top:0">연구대</div>';
    if (s.research) {
      const item = findItem(s, s.research.itemUid);
      r.innerHTML += `<div>${item ? ITEMS[item.defId].name : '?'} · ${UPGRADE_BY_ID[s.research.upgradeId].name} → Lv${s.research.toLevel} · 남은 ${timerHtml('research', s, now)}</div>${jobBar('research', s, now)}`;
    } else r.innerHTML += '<div class="dim">대기 중</div>';
    r.appendChild(button('연구대로', () => ctx.go('research'), 'sm'));
    jobs.appendChild(r);
    el.appendChild(jobs);

    // 요약
    const sum = div('row');
    sum.style.marginTop = '10px';
    const unlocked = NODES.filter((n) => n.id in s.nodes).length;
    const stat = (t: string, v: string) => { const c = div('card', `<div class="dim">${t}</div><div style="font-size:18px;font-weight:bold">${v}</div>`); c.style.minWidth = '120px'; return c; };
    sum.append(
      stat('지식 노드', `${unlocked}/${NODES.length}`),
      stat('창고 빈 칸', `${freeCells(s.stash)}/${s.stash.w * s.stash.h}`),
      stat('안전 보관함', `${allInstances(s.safe).length}개`),
      stat('출격 준비', s.prep.weapons.length ? `무기 ${s.prep.weapons.length}` : '무기 없음'),
      stat('레이드', `${s.stats.extracts}탈출 / ${s.stats.deaths}사망`),
    );
    el.appendChild(sum);

    el.appendChild(div('h2', '바로 가기'));
    const nav = div('row');
    for (const [label, id] of [['창고', 'stash'], ['작업대', 'workbench'], ['지식 트리', 'tree']] as const) nav.appendChild(button(label, () => ctx.go(id)));
    nav.appendChild(button('출격 준비 ➤', () => ctx.go('prep'), 'pri'));
    el.appendChild(nav);

    if (s.log.length) {
      el.appendChild(div('h2', '최근 소식'));
      for (const l of s.log.slice(-6).reverse()) el.appendChild(div('dim', `· ${l}`));
    }

    el.appendChild(div('h2', '데이터'));
    el.appendChild(button(resetArmed ? '정말 새 게임? (모든 진행 삭제)' : '새 게임', () => {
      if (!resetArmed) { resetArmed = true; render(); return; }
      Object.assign(s, defaultSave());
      ctx.commit();
      ctx.toast('새 게임을 시작했습니다');
      ctx.go('home');
    }, 'sm danger'));
  }
  render();
  return { el, refresh: render, tick: () => tickTimers(el, ctx.save, ctx.now()) };
};
