import { ITEMS } from '../../data/items';
import { createInventoryBoard } from '../../inventory/InventoryBoard';
import { isBusy, safeBoxRejects } from '../state';
import type { ScreenFactory } from '../HubShell';
import { div } from './dom';

/** 창고: 아이템 배치/이동/회전, 안전 보관함 편집. 안전 보관함은 레이드에서 획득한 아이템만 넣을 수 있다(허브에서는 꺼내기·재배치만) */
export const stashScreen: ScreenFactory = (ctx) => {
  const el = div();
  el.appendChild(div('h1', '창고'));
  const board = createInventoryBoard({
    grids: [
      { id: 'stash', title: '창고', grid: ctx.save.stash },
      { id: 'safe', title: '안전 보관함', grid: ctx.save.safe, note: '레이드 획득품만 · 사망해도 유지',
        accepts: (i) => safeBoxRejects(i) },
    ],
    allowDiscard: true,
    canDiscard: (i) => (ITEMS[i.defId].kind === 'equipment' ? '연구 장비는 버릴 수 없습니다' : null),
    locked: (i) => (isBusy(ctx.save, i) ? '연구 중인 아이템은 옮길 수 없습니다' : null),
    onChange: () => ctx.commit(),
  });
  el.appendChild(board.el);
  return { el, refresh: () => board.refresh(), dispose: () => board.destroy() };
};
