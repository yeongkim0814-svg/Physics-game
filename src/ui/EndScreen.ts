import { BASES } from '../data/bases';
import { MATERIALS } from '../data/materials';
import { PARTS } from '../data/parts';
import { onTap } from './tap';
import type { StoredWeapon } from '../core/types';

export interface EndInfo {
  outcome: 'extracted' | 'dead';
  kills: number;
  seconds: number;
  /** 탈출: 레이드 전후 재료 증감 (사망이면 비어 있음) */
  delta: Record<string, number>;
  /** 사망: 잃은 소지품 */
  lost: { weapons: StoredWeapon[]; materials: Record<string, number> };
  /** 지금 안전 보관함에 있는 것 */
  stash: { weapons: StoredWeapon[]; materials: Record<string, number> };
}

export interface EndActions {
  restart: () => void;
  /** 탈출 성공 시에만: 보관함 무기를 자동 수리하고 새 레이드 */
  repairAndRestart?: () => void;
}

const fmtMat = (m: Record<string, number>, signed = false) => {
  const parts = Object.entries(m).filter(([, n]) => n !== 0)
    .map(([id, n]) => `${MATERIALS[id]?.name ?? id} ${signed && n > 0 ? '+' : ''}${n}`);
  return parts.length ? parts.join(', ') : '없음';
};
const fmtWeapon = (w: StoredWeapon) => {
  const parts = Object.values(w.loadout.parts).map((id) => PARTS[id as string]?.name).filter(Boolean);
  return `${BASES[w.loadout.base].name}${parts.length ? ` (${parts.join(', ')})` : ''} 내구도 ${Math.ceil(w.baseDurability)}`;
};

/** 사망/탈출 결과 화면 (임시 스타일, 정식 UI 는 T9). 터치하기 쉬운 큰 버튼 */
export function showEndScreen(root: HTMLElement, info: EndInfo, actions: EndActions) {
  const ok = info.outcome === 'extracted';
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    `background:rgba(10,13,16,0.88);color:#cfd;font:15px monospace;text-align:center;gap:6px;padding:16px;overflow:auto;`;
  const line = (t: string, css = '') => {
    const d = document.createElement('div');
    d.style.cssText = css;
    d.textContent = t;
    el.appendChild(d);
  };
  line(ok ? '탈출 성공' : '사망', `font-size:34px;font-weight:bold;margin-bottom:8px;color:${ok ? '#7fbf6a' : '#c0452e'}`);
  line(`처치 ${info.kills}  ·  ${Math.round(info.seconds)}초`);
  if (ok) {
    line(`재료 증감: ${fmtMat(info.delta, true)}`);
    line('소지품이 안전 보관함으로 이동했다');
  } else {
    line(`잃은 무기: ${info.lost.weapons.length ? info.lost.weapons.map(fmtWeapon).join(' / ') : '없음'}`, 'color:#c0452e');
    line(`잃은 재료: ${fmtMat(info.lost.materials)}`, 'color:#c0452e');
    line('안전 보관함에 있던 것만 남았다');
  }
  line(`보관함 재료: ${fmtMat(info.stash.materials)}`, 'margin-top:10px;opacity:0.85');
  line(`보관함 무기: ${info.stash.weapons.length ? info.stash.weapons.map(fmtWeapon).join(' / ') : '없음 (다음 레이드에서 보급 무기 지급)'}`, 'opacity:0.85');

  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin-top:14px;min-width:260px;min-height:56px;font:bold 17px monospace;color:#fff;background:#363d2a;' +
      'border:2px solid #7fbf6a;cursor:pointer';
    onTap(b, fn);
    el.appendChild(b);
  };
  if (ok && actions.repairAndRestart) btn('자동 수리 후 새 레이드', actions.repairAndRestart);
  btn(ok ? '수리 없이 새 레이드' : '새 레이드', actions.restart);
  root.appendChild(el);
}
