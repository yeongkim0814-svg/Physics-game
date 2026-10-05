import { ITEMS } from '../../data/items';
import { countOf, type Grid } from '../../inventory/grid';
import { onTap } from '../../ui/tap';
import type { HubSave } from '../save';
import { remainingMs } from '../state';
import { fmtTime } from '../HubShell';

export function div(cls = '', html = ''): HTMLDivElement {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

export function button(label: string, fn: () => void, cls = '', disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `btn ${cls}${disabled ? ' off' : ''}`;
  b.textContent = label;
  if (!disabled) onTap(b, fn);
  return b;
}

/** 재료 비용 표시: 보유/필요, 모자라면 빨강 */
export function costHtml(g: Grid, cost: Record<string, number>): string {
  return Object.entries(cost).map(([id, n]) => {
    const have = countOf(g, id);
    return `<span class="tag ${have >= n ? 'good' : 'bad'}">${ITEMS[id]?.name ?? id} ${have}/${n}</span>`;
  }).join('');
}

/** 아이템 목록에서 한 개 고르는 카드 목록 */
export function pickList<T>(items: T[], render: (t: T) => string, isSel: (t: T) => boolean, onPick: (t: T) => void, empty = '없음'): HTMLElement {
  const wrap = div('col');
  if (!items.length) wrap.appendChild(div('dim', empty));
  for (const t of items) {
    const c = div(`card${isSel(t) ? ' sel' : ''}`, render(t));
    c.style.cursor = 'pointer';
    onTap(c, () => onPick(t));
    wrap.appendChild(c);
  }
  return wrap;
}

export function bar(ratio: number, warn = false): string {
  return `<div class="bar${warn ? ' warn' : ''}"><i style="width:${Math.max(0, Math.min(1, ratio)) * 100}%"></i></div>`;
}

type JobKind = 'analysis' | 'research';
const jobOf = (s: HubSave, k: JobKind) => (k === 'analysis' ? s.analysis : s.research);

/** 남은 시간 표시 칸 (tickTimers 가 매초 텍스트만 갱신 — DOM 을 다시 만들지 않아 탭이 끊기지 않는다) */
export function timerHtml(kind: JobKind, s: HubSave, now: number): string {
  const j = jobOf(s, kind);
  return j ? `<b class="warn" data-timer="${kind}">${fmtTime(remainingMs(j, now))}</b>` : '';
}
export function jobBar(kind: JobKind, s: HubSave, now: number): string {
  const j = jobOf(s, kind);
  if (!j) return '';
  const r = 1 - remainingMs(j, now) / Math.max(1, j.durationMs);
  return `<div class="bar" data-bar="${kind}"><i style="width:${Math.max(0, Math.min(1, r)) * 100}%"></i></div>`;
}
export function tickTimers(root: HTMLElement, s: HubSave, now: number) {
  for (const k of ['analysis', 'research'] as const) {
    const j = jobOf(s, k);
    if (!j) continue;
    for (const t of root.querySelectorAll(`[data-timer="${k}"]`)) t.textContent = fmtTime(remainingMs(j, now));
    for (const b of root.querySelectorAll(`[data-bar="${k}"] > i`)) (b as HTMLElement).style.width = `${(1 - remainingMs(j, now) / Math.max(1, j.durationMs)) * 100}%`;
  }
}
