import { UI } from '../config/settings';

/**
 * 공통 UI 스타일 (단순 픽셀형: 각진 테두리, 모노스페이스, 낮은 채도, 큰 터치 영역).
 * 색은 올리브/녹색 팔레트. 기능색: 증가=초록, 감소=빨강, 중립 변화=호박.
 * 현재는 토스트·버튼·막대 등 최소 공통 요소만 둔다 (추후 일지 등 UI 가 재사용).
 */
const CSS = `
:root{--bg:#0a0d10;--panel:#14181c;--line:#3a4430;--fg:#cfe0cc;--dim:#7d8a78;--acc:#7fbf6a;--accfg:#0a0d10;
--btn:#363d2a;--good:#7fbf6a;--bad:#c0452e;--warn:#d89a2e}
.dim{color:var(--dim)}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.btn{min-height:44px;min-width:64px;padding:6px 12px;font:bold 14px monospace;color:var(--fg);background:var(--btn);border:2px solid var(--acc);cursor:pointer;touch-action:none}
.btn.pri{background:var(--acc);color:var(--accfg)}
.btn[disabled]{opacity:.4;border-color:var(--line);cursor:default}
.bar{height:10px;background:#000;border:1px solid var(--line);min-width:80px}
.bar>i{display:block;height:100%;background:var(--acc)}
.tag{display:inline-block;padding:0 6px;border:1px solid var(--line);color:var(--dim);font-size:12px;margin-right:4px}
.toast{position:fixed;left:50%;top:44px;transform:translateX(-50%);background:var(--btn);border:2px solid var(--acc);padding:8px 14px;z-index:90;max-width:90vw;pointer-events:none;font-weight:bold}
.toast.bad{border-color:var(--bad)}
`;

let injected = false;
export function ensureUiStyle() {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** 짧게 떴다 사라지는 알림 */
export function toast(root: HTMLElement, msg: string, bad = false) {
  ensureUiStyle();
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), UI.toastMs);
}
