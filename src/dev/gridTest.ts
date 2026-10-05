import { addItem, makeGrid } from '../inventory/grid';
import { createInventoryBoard } from '../inventory/InventoryBoard';
import { createItem } from '../hub/gear';
import { safeBoxRejects } from '../hub/state';
import { TUNING } from '../config/tuning';
import { ensureHubStyle } from '../ui/hubStyle';

/** 격자 인벤토리 단독 테스트 페이지 (?dev=grid): 창고 + 안전 보관함(레이드 획득품만) + 가방. 저장 없음 */
export function startGridTest(root: HTMLElement) {
  ensureHubStyle();
  const G = TUNING.hub.grid;
  const stash = makeGrid(G.stash.w, G.stash.h), safe = makeGrid(G.safe.w, G.safe.h), bag = makeGrid(G.bag.w, G.bag.h);
  for (const [id, n] of [['momentum_launcher', 1], ['em_coil', 1], ['plate_vest', 1], ['analyzer_1', 1], ['handle', 1], ['scope', 1],
    ['scrap', 45], ['slag', 20], ['ingot', 7], ['copper_wire', 12], ['shin_guard', 1]] as const) addItem(stash, createItem(id, n));
  addItem(bag, createItem('anomaly_sample', 2, { found: true }));
  addItem(bag, createItem('magnet_chip', 3, { found: true }));

  const wrap = document.createElement('div');
  wrap.className = 'hub';
  const top = document.createElement('div');
  top.className = 'hub-top';
  top.innerHTML = '<b>GRID TEST</b><span class="dim">★ = 레이드 획득품만 안전 보관함에 들어감</span>';
  const body = document.createElement('div');
  body.className = 'hub-body';
  const board = createInventoryBoard({
    grids: [
      { id: 'stash', title: '창고', grid: stash },
      { id: 'bag', title: '가방', grid: bag },
      { id: 'safe', title: '안전 보관함', grid: safe, accepts: (i) => safeBoxRejects(i) },
    ],
    allowDiscard: true,
    onChange: () => { (window as unknown as { __grids: unknown }).__grids = { stash, bag, safe }; },
  });
  (window as unknown as { __grids: unknown }).__grids = { stash, bag, safe };
  body.appendChild(board.el);
  wrap.append(top, body);
  root.appendChild(wrap);
}
