import { ensureHubStyle } from './hubStyle';
import { createInventoryBoard } from '../inventory/InventoryBoard';
import { safeBoxRejects } from '../hub/state';
import { onTap } from './tap';
import type { Grid } from '../inventory/grid';

/**
 * 레이드 중 가방 화면: 가방 ↔ 안전 보관함. 안전 보관함에는 이번 레이드에서 획득한(★) 아이템만 넣을 수 있고,
 * 사망해도 유지된다. 열려 있는 동안 레이드는 일시정지(호출측).
 */
export function openBagOverlay(root: HTMLElement, bag: Grid, safe: Grid, onChange: () => void, onClose: () => void) {
  ensureHubStyle();
  const el = document.createElement('div');
  el.className = 'hub';
  el.style.zIndex = '60';
  const top = document.createElement('div');
  top.className = 'hub-top';
  top.innerHTML = '<b>BAG</b><span class="dim">★ 획득품만 안전 보관함에 넣을 수 있습니다 · 사망 시 가방은 손실, 안전 보관함은 유지</span><span class="sp"></span>';
  const close = document.createElement('button');
  close.className = 'btn pri';
  close.textContent = '닫기 (B)';
  onTap(close, () => done());
  top.appendChild(close);
  const body = document.createElement('div');
  body.className = 'hub-body';
  const board = createInventoryBoard({
    grids: [
      { id: 'bag', title: '가방', grid: bag },
      { id: 'safe', title: '안전 보관함', grid: safe, note: '획득품만 · 사망해도 유지', accepts: (i) => safeBoxRejects(i) },
    ],
    allowDiscard: true,
    onChange,
  });
  body.appendChild(board.el);
  el.append(top, body);
  root.appendChild(el);

  const onKey = (e: KeyboardEvent) => { if (e.code === 'KeyB') done(); };
  addEventListener('keydown', onKey);
  let closed = false;
  function done() {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey);
    board.destroy();
    el.remove();
    onClose();
  }
  return { close: done };
}
