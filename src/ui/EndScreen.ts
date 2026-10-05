import { ITEMS } from '../data/items';
import { PARTS } from '../data/parts';
import { onTap } from './tap';
import type { ItemInstance } from '../inventory/grid';

export interface EndInfo {
  outcome: 'extracted' | 'dead';
  kills: number;
  seconds: number;
  /** 탈출: 입고된 아이템 (id → 수량, 장착 장비·가방·안전 보관함 모두) */
  gained: Record<string, number>;
  /** 탈출: 창고가 가득 차 입고 대기로 간 수량 */
  overflow: number;
  /** 사망: 잃은 아이템(가방·장착 장비) */
  lost: ItemInstance[];
  /** 안전 보관함에 남은 아이템 수 (사망 시 유지) */
  keptSafe: number;
}

export interface EndActions {
  /** 허브로 (정산은 이미 저장됨) */
  toHub: () => void;
}

const fmtItem = (i: ItemInstance) => {
  const name = ITEMS[i.defId]?.name ?? i.defId;
  const parts = Object.values(i.parts ?? {}).map((p) => p && PARTS[p.defId]?.name).filter(Boolean);
  return `${name}${i.count > 1 ? ` ×${i.count}` : ''}${parts.length ? ` (${parts.join(', ')})` : ''}`;
};
const fmtGained = (m: Record<string, number>) => {
  const parts = Object.entries(m).map(([id, n]) => `${ITEMS[id]?.name ?? id}${n > 1 ? ` ×${n}` : ''}`);
  return parts.length ? parts.join(', ') : '없음';
};

/** 사망/탈출 결과 화면. 정산 규칙은 hub/state.ts (settleExtract/settleDeath) 가 이미 적용·저장한 뒤 보여 준다 */
export function showEndScreen(root: HTMLElement, info: EndInfo, actions: EndActions) {
  const ok = info.outcome === 'extracted';
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'background:rgba(10,13,16,0.9);color:#cfd;font:15px monospace;text-align:center;gap:6px;padding:16px;overflow:auto;';
  const line = (t: string, css = '') => {
    const d = document.createElement('div');
    d.style.cssText = css;
    d.textContent = t;
    el.appendChild(d);
  };
  line(ok ? '탈출 성공' : '사망', `font-size:34px;font-weight:bold;margin-bottom:8px;color:${ok ? '#7fbf6a' : '#c0452e'}`);
  line(`처치 ${info.kills}  ·  ${Math.round(info.seconds)}초`);
  if (ok) {
    line(`입고: ${fmtGained(info.gained)}`, 'max-width:640px');
    line('가방·장착 장비·안전 보관함이 창고로 이동했다');
    if (info.overflow > 0) line(`⚠ 창고가 가득 차 ${info.overflow}개는 입고 대기 — 허브에서 정리하거나 버려야 한다`, 'color:#d89a2e');
  } else {
    line(`잃은 것: ${info.lost.length ? info.lost.map(fmtItem).join(' / ') : '없음'}`, 'color:#c0452e;max-width:640px');
    line(`안전 보관함 ${info.keptSafe}개는 유지됐다`);
  }
  const b = document.createElement('button');
  b.textContent = '아지트로';
  b.style.cssText = 'margin-top:14px;min-width:260px;min-height:56px;font:bold 17px monospace;color:#fff;background:#363d2a;border:2px solid #7fbf6a;cursor:pointer';
  onTap(b, actions.toHub);
  el.appendChild(b);
  root.appendChild(el);
}
