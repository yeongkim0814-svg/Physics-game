import { ensureHubStyle, toast } from '../ui/hubStyle';
import { onTap } from '../ui/tap';
import { storage } from './storage';
import { type HubSave } from './save';
import { ensureEssentials, pendingCount, resolveJobs } from './state';

export type TabId = 'home' | 'stash' | 'analyzer' | 'research' | 'workbench' | 'tree' | 'prep';

export interface HubCtx {
  save: HubSave;
  root: HTMLElement;
  /** 저장 (localStorage, 실패해도 게임은 계속) */
  commit(): void;
  toast(msg: string, bad?: boolean): void;
  go(tab: TabId): void;
  now(): number;
  /** 현재 화면 다시 그리기 */
  refresh(): void;
  launchRaid(): void;
}

export interface Screen {
  el: HTMLElement;
  /** 상태가 바뀌었을 때(작업 완료, 다른 화면에서 이동 등) 다시 그린다 */
  refresh?(): void;
  /** 매초 호출 (남은 시간 표시 갱신) */
  tick?(): void;
  dispose?(): void;
}
export type ScreenFactory = (ctx: HubCtx) => Screen;

export const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'home', label: '허브', glyph: '▣' },
  { id: 'stash', label: '창고', glyph: '▤' },
  { id: 'analyzer', label: '분석기', glyph: '◉' },
  { id: 'research', label: '연구대', glyph: '⚗' },
  { id: 'workbench', label: '작업대', glyph: '⚒' },
  { id: 'tree', label: '지식 트리', glyph: '✦' },
  { id: 'prep', label: '출격 준비', glyph: '➤' },
];

/**
 * 허브 셸: 상단 상태줄 + 한 화면에 한 기능 + 하단 탭 7개.
 * 분석·연구는 타임스탬프 기반이라 화면을 옮겨 다녀도, 앱을 껐다 켜도 진행된다 (매초 resolveJobs 로 확정).
 * 입고 대기(pending)가 남아 있으면 탭 대신 입고 화면을 강제로 띄운다.
 */
export function createHubShell(
  root: HTMLElement,
  save: HubSave,
  factories: Record<TabId, ScreenFactory>,
  intakeFactory: ScreenFactory,
  launchRaid: () => void,
) {
  ensureHubStyle();
  const el = document.createElement('div');
  el.className = 'hub';
  const top = document.createElement('div');
  top.className = 'hub-top';
  const title = document.createElement('b');
  title.textContent = 'AGIT // 아지트';
  const sp = document.createElement('span');
  sp.className = 'sp';
  const status = document.createElement('span');
  status.className = 'dim';
  top.append(title, sp, status);
  const body = document.createElement('div');
  body.className = 'hub-body';
  const tabs = document.createElement('div');
  tabs.className = 'hub-tabs';
  el.append(top, body, tabs);
  root.appendChild(el);

  let current: TabId = 'home';
  let screen: Screen | null = null;
  let intake = false;
  const tabEls = new Map<TabId, HTMLElement>();

  const ctx: HubCtx = {
    save, root: el,
    commit: () => storage.save(save),
    toast: (m, bad) => toast(el, m, bad),
    go: (t) => show(t),
    now: () => Date.now(),
    refresh: () => screen?.refresh?.(),
    launchRaid,
  };

  for (const t of TABS) {
    const b = document.createElement('button');
    b.className = 'hub-tab';
    b.innerHTML = `<span class="g">${t.glyph}</span><span>${t.label}</span>`;
    onTap(b, () => { if (!intake) show(t.id); });
    tabs.appendChild(b);
    tabEls.set(t.id, b);
  }

  function mount(factory: ScreenFactory) {
    screen?.dispose?.();
    body.innerHTML = '';
    screen = factory(ctx);
    body.appendChild(screen.el);
  }

  function show(tab: TabId) {
    current = tab;
    for (const [id, b] of tabEls) b.classList.toggle('on', !intake && id === tab);
    mount(factories[tab]);
    body.scrollTop = 0;
    updateChrome();
  }

  function updateChrome() {
    const w = save.prep.weapons.length;
    status.textContent = (storage.available() ? '' : '⚠ 저장 불가(브라우저 차단) · ') + `출격 준비: 무기 ${w}${save.prep.armor.body || save.prep.armor.aux ? ' · 방어구' : ''}`;
    tabEls.get('prep')!.querySelector('.dot')?.remove();
    if (!w) return;
    const d = document.createElement('i');
    d.className = 'dot';
    tabEls.get('prep')!.appendChild(d);
  }

  /** 입고 대기가 있으면 강제 입고 화면, 비면 정상 화면으로 */
  function syncIntake() {
    const need = pendingCount(save) > 0;
    if (need && !intake) { intake = true; for (const b of tabEls.values()) { b.classList.remove('on'); b.classList.add('off'); } mount(intakeFactory); }
    else if (!need && intake) { intake = false; for (const b of tabEls.values()) b.classList.remove('off'); show('home'); }
  }
  ctx.refresh = () => { syncIntake(); if (!intake) updateChrome(); screen?.refresh?.(); };
  const baseCommit = ctx.commit;
  ctx.commit = () => { ensureEssentials(save); baseCommit(); updateChrome(); syncIntake(); };

  const timer = setInterval(() => {
    const msgs = resolveJobs(save, ctx.now());
    if (msgs.length) {
      ctx.commit();
      for (const m of msgs) ctx.toast(m);
      screen?.refresh?.();
    }
    screen?.tick?.();
  }, 1000);

  // 시작: 꺼져 있는 동안 끝난 작업을 따라잡는다
  const caught = resolveJobs(save, ctx.now());
  if (caught.length) { storage.save(save); for (const m of caught) setTimeout(() => ctx.toast(m), 300); }
  if (pendingCount(save) > 0) { intake = true; for (const b of tabEls.values()) b.classList.add('off'); mount(intakeFactory); updateChrome(); }
  else show(current);

  return { ctx, destroy() { clearInterval(timer); screen?.dispose?.(); el.remove(); } };
}

/** m:ss / h:mm:ss */
export function fmtTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
