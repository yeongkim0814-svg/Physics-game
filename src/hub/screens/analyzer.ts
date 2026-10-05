import { TUNING } from '../../config/tuning';
import { EQUIPMENT } from '../../data/equipment';
import { ITEMS } from '../../data/items';
import { NODES } from '../../data/knowledge';
import { allInstances, countOf } from '../../inventory/grid';
import { analysisStatus, analyzerTier, nextNodeFor, startAnalysis } from '../state';
import { fmtTime, type ScreenFactory } from '../HubShell';
import { button, div, jobBar, timerHtml, tickTimers } from './dom';

const SAMPLE = 'anomaly_sample';

/** 분석기: 미분석 샘플 + 분석기 단계 → 대기 후 새 지식 노드 해금. 분석 중에도 다른 화면 사용 가능 */
export const analyzerScreen: ScreenFactory = (ctx) => {
  const el = div();
  function render() {
    const s = ctx.save, now = ctx.now();
    el.innerHTML = '';
    el.appendChild(div('h1', '분석기'));
    const tier = analyzerTier(s);
    const owned = allInstances(s.stash).filter((i) => EQUIPMENT[i.defId]?.type === 'analyzer').map((i) => `${ITEMS[i.defId].name}(${EQUIPMENT[i.defId].tier}단계)`);

    const top = div('row');
    top.style.alignItems = 'stretch';
    const eq = div('card', `<div class="h2" style="margin-top:0">보유 분석기</div><div>${owned.join(', ') || '<span class="bad">없음</span>'}</div><div class="dim">최고 ${tier}단계 · 마모 없이 영구. 상위 분석기는 작업대에서 장비 부품으로 제작</div>`);
    eq.style.cssText = 'flex:1;min-width:260px';
    const smp = countOf(s.stash, SAMPLE) + countOf(s.safe, SAMPLE);
    const sm = div('card', `<div class="h2" style="margin-top:0">미분석 샘플</div><div style="font-size:20px;font-weight:bold">${smp}개</div><div class="dim">레이드에서 이상 현상을 찾아 회수</div>`);
    sm.style.cssText = 'flex:1;min-width:200px';
    top.append(eq, sm);
    el.appendChild(top);

    el.appendChild(div('h2', '분석'));
    if (s.analysis) {
      const c = div('card', `<div>분석 진행 중… 남은 시간 <span style="font-size:18px">${timerHtml('analysis', s, now)}</span></div>${jobBar('analysis', s, now)}<div class="dim">결과는 완료되면 알려 드립니다. 다른 화면으로 이동해도 됩니다.</div>`);
      el.appendChild(c);
    } else {
      const st = analysisStatus(s, SAMPLE);
      const next = nextNodeFor(s, SAMPLE);
      const c = div('card');
      if (!next) c.innerHTML = '<div class="good">모든 노드를 해금했습니다</div>';
      else {
        c.innerHTML = `<div>다음 노드: <b>???</b> <span class="tag">분석기 ${next.analyzerTier}단계 필요</span><span class="tag">소요 ${fmtTime(next.analyzeSeconds * 1000 * TUNING.hub.timeScale)}</span></div>
          <div class="${st.ok ? 'good' : 'bad'}">${st.ok ? '분석 가능' : st.ok ? '' : st.msg}</div><div class="dim">샘플 1개를 소모합니다. 해금은 확정적(실패 없음).</div>`;
      }
      c.appendChild(button('분석 시작', () => {
        const r = startAnalysis(s, SAMPLE, ctx.now());
        if (!r.ok) { ctx.toast(r.msg, true); return; }
        ctx.commit();
        ctx.toast('분석을 시작했습니다');
        render();
      }, 'pri', !st.ok));
      el.appendChild(c);
    }

    const done = NODES.filter((n) => n.id in s.nodes).length;
    el.appendChild(div('dim', `해금한 노드 ${done}/${NODES.length} — 지식 트리에서 확인`));
  }
  render();
  return { el, refresh: render, tick: () => tickTimers(el, ctx.save, ctx.now()) };
};
