import type { BaseId, Loadout } from '../core/types';
import { BASES } from '../data/bases';
import { PARTS } from '../data/parts';
import { onTap } from './tap';

const PART_SLOTS = ['front', 'rear', 'top'] as const;

export interface SelectActions {
  start: (loadout: Loadout) => void;
}

/** 베이스 선택 → 부품 선택(optional) → 시작. 터치 친화적 버튼 */
export function showSelectScreen(root: HTMLElement, actions: SelectActions) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    `background:#0a0d10;color:#cfd;font:14px monospace;gap:12px;padding:20px;overflow:auto;`;

  const line = (t: string, css = '') => {
    const d = document.createElement('div');
    d.style.cssText = css || 'opacity:0.8';
    d.textContent = t;
    el.appendChild(d);
  };

  let selected: Loadout = { base: 'momentum_launcher' as BaseId, parts: {} };
  let step: 'base' | 'parts' | 'ready' = 'base';

  const btn = (label: string, fn: () => void, css = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `min-width:240px;min-height:48px;font:bold 15px monospace;color:#fff;background:#363d2a;border:2px solid #7fbf6a;cursor:pointer;${css}`;
    onTap(b, fn);
    el.appendChild(b);
  };

  const render = () => {
    el.innerHTML = '';
    if (step === 'base') {
      line('무기 선택', 'font-size:18px;font-weight:bold;margin-bottom:6px');
      for (const base of Object.keys(BASES) as BaseId[]) {
        const b = BASES[base];
        const active = selected.base === base;
        btn(b.name, () => { selected.base = base; selected.parts = {}; step = 'parts'; render(); },
          `margin-top:6px;${active ? 'background:#7fbf6a;color:#0a0d10;' : ''}`);
      }
    } else if (step === 'parts') {
      line(`${BASES[selected.base].name} 부품 선택`, 'font-size:16px;margin-bottom:6px');
      line('부품 없이 시작할 수도 있습니다', 'opacity:0.6;font-size:12px');
      for (const slot of PART_SLOTS) {
        const parts = Object.entries(PARTS).filter(([, p]) => p.slot === slot);
        const current = selected.parts[slot];
        line(`\n[${slot.toUpperCase()}]`, 'font-weight:bold;margin-top:8px');
        if (current) {
          btn(`✓ ${PARTS[current].name}`, () => { delete selected.parts[slot]; render(); }, 'background:#7fbf6a;color:#0a0d10');
        }
        for (const [id, p] of parts) {
          if (id !== current) {
            btn(p.name, () => { selected.parts[slot] = id; render(); });
          }
        }
      }
      line('', '');
      btn('부품 선택 완료 →', () => { step = 'ready'; render(); }, 'margin-top:10px;background:#7fbf6a;color:#0a0d10');
    } else {
      line(`${BASES[selected.base].name}`, 'font-size:16px;font-weight:bold;margin-bottom:4px');
      const parts = Object.entries(selected.parts).map(([slot, id]) => `${slot}:${PARTS[id].name}`);
      if (parts.length) line(`부품: ${parts.join(', ')}`, 'opacity:0.8');
      else line('부품 없음', 'opacity:0.6');
      line('', '');
      btn('레이드 시작', () => { actions.start(selected); }, 'background:#7fbf6a;color:#0a0d10;font-size:16px');
      btn('← 돌아가기', () => { step = 'parts'; render(); });
    }
  };
  render();
  root.appendChild(el);
}
