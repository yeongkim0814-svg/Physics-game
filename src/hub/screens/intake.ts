import { createInventoryBoard } from '../../inventory/InventoryBoard';
import { discardPending, pendingCount } from '../state';
import type { ScreenFactory } from '../HubShell';
import { button, div } from './dom';

/**
 * 입고 선택: 탈출했지만 창고가 가득 차 못 들어간 아이템. 창고를 정리해 자리를 만들어 넣거나, 버려야 한다.
 * 다 비워질 때까지 다른 화면으로 이동할 수 없다 (저장되므로 앱을 껐다 켜도 그대로).
 */
export const intakeScreen: ScreenFactory = (ctx) => {
  const el = div();
  const s = ctx.save;
  el.appendChild(div('h1', '입고 선택 — 창고가 가득 찼습니다'));
  el.appendChild(div('dim', '오른쪽 "입고 대기" 아이템을 창고에 넣거나(자동 배치/탭 배치), 필요 없는 것은 버리세요. 창고 정리·버리기로 자리를 만들 수 있습니다.'));
  const count = div('warn');
  const board = createInventoryBoard({
    grids: [
      { id: 'stash', title: '창고', grid: s.stash },
      { id: 'pending', title: '입고 대기', grid: s.pending, accepts: () => '입고 대기 칸에는 넣을 수 없습니다', note: '비워야 계속' },
    ],
    allowDiscard: true,
    onChange: () => { count.textContent = `남은 아이템 ${pendingCount(s)}개`; ctx.commit(); },
  });
  count.textContent = `남은 아이템 ${pendingCount(s)}개`;
  el.append(count, board.el);

  let armed = false;
  const all = button('남은 것 모두 버리고 계속', () => {
    if (!armed) { armed = true; all.textContent = '정말 모두 버립니다 (한 번 더)'; return; }
    for (const p of [...s.pending.placed]) discardPending(s, p.inst.uid);
    ctx.commit();
  }, 'danger');
  el.appendChild(all);
  return { el, refresh: () => board.refresh(), dispose: () => board.destroy() };
};
