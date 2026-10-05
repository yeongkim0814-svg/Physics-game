import { TUNING } from '../config/tuning';

/**
 * 허브/인벤토리 공통 스타일 (단순 픽셀형: 각진 테두리, 모노스페이스, 낮은 채도, 큰 터치 영역).
 * 색은 레이드 UI 와 같은 팔레트(올리브/녹색). 기능색: 증가=초록, 감소=빨강, 중립 변화=호박.
 */
const CSS = `
:root{--bg:#0a0d10;--panel:#14181c;--panel2:#1b2127;--line:#3a4430;--fg:#cfe0cc;--dim:#7d8a78;--acc:#7fbf6a;--accfg:#0a0d10;
--btn:#363d2a;--good:#7fbf6a;--bad:#c0452e;--warn:#d89a2e;--cell:${TUNING.hub.ui.cellPx}px}
.hub,.hub *{box-sizing:border-box}
.hub{position:fixed;inset:0;background:var(--bg);color:var(--fg);font:14px/1.35 monospace;display:flex;flex-direction:column;
 -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;image-rendering:pixelated;z-index:50}
.hub-top{display:flex;align-items:center;gap:12px;padding:6px 12px;border-bottom:2px solid var(--line);background:var(--panel);min-height:34px}
.hub-top b{color:var(--acc);letter-spacing:1px}
.hub-top .sp{flex:1}
.hub-body{flex:1;overflow:auto;padding:10px 12px;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.hub-tabs{display:flex;border-top:2px solid var(--line);background:var(--panel)}
.hub-tab{flex:1;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
 border:0;border-right:1px solid var(--line);background:transparent;color:var(--dim);font:bold 13px monospace;cursor:pointer;position:relative;padding:4px 2px;touch-action:none}
.hub-tab:last-child{border-right:0}
.hub-tab.on{background:var(--btn);color:var(--fg);box-shadow:inset 0 3px 0 var(--acc)}
.hub-tab.off{opacity:.35;cursor:default}
.hub-tab .dot{position:absolute;top:6px;right:10px;width:10px;height:10px;background:var(--warn)}
.hub-tab .g{font-size:18px}
.h1{font:bold 17px monospace;color:var(--acc);margin:0 0 8px}
.h2{font:bold 14px monospace;color:var(--fg);margin:10px 0 6px;border-bottom:1px solid var(--line);padding-bottom:3px}
.dim{color:var(--dim)}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.row{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.col{display:flex;flex-direction:column;gap:6px}
.card{background:var(--panel);border:2px solid var(--line);padding:8px 10px}
.card.sel{border-color:var(--acc)}
.card.lock{opacity:.55}
.btn{min-height:44px;min-width:64px;padding:6px 12px;font:bold 14px monospace;color:var(--fg);background:var(--btn);border:2px solid var(--acc);cursor:pointer;touch-action:none}
.btn.pri{background:var(--acc);color:var(--accfg)}
.btn.sm{min-height:36px;min-width:44px;padding:4px 8px;font-size:13px}
.btn[disabled],.btn.off{opacity:.4;border-color:var(--line);cursor:default}
.btn.danger{border-color:var(--bad);color:#f0b0a0}
.bar{height:10px;background:#000;border:1px solid var(--line);min-width:80px}
.bar>i{display:block;height:100%;background:var(--acc)}
.bar.warn>i{background:var(--warn)}
.tag{display:inline-block;padding:0 6px;border:1px solid var(--line);color:var(--dim);font-size:12px;margin-right:4px}
.toast{position:fixed;left:50%;top:44px;transform:translateX(-50%);background:var(--btn);border:2px solid var(--acc);padding:8px 14px;z-index:90;max-width:90vw;pointer-events:none;font-weight:bold}
.toast.bad{border-color:var(--bad)}
table.cmp{border-collapse:collapse;width:100%}
table.cmp td{padding:2px 6px;border-bottom:1px solid #222a1f}
table.cmp td.n{text-align:right;white-space:nowrap}
.ar.up{color:var(--good)}.ar.down{color:var(--bad)}.ar.mid{color:var(--warn)}.ar.same{color:var(--dim)}
/* --- 격자 --- */
.inv-board{display:flex;flex-direction:column;gap:8px}
.inv-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:var(--panel);border:2px solid var(--line);padding:6px;min-height:56px}
.inv-info{flex:1;min-width:180px;font-size:12px;color:var(--dim)}
.inv-info b{color:var(--fg)}
.inv-grids{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.inv-item.fill{position:absolute}
.inv-panel{background:var(--panel);border:2px solid var(--line);padding:6px}
.inv-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-weight:bold}
.inv-head .sp{flex:1}
.inv-scroll{overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.inv-grid{position:relative;background-color:#0d1114;touch-action:pan-y;
 background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:var(--cell) var(--cell);border:1px solid var(--line)}
.inv-grid.drag{touch-action:none}
.inv-item{position:absolute;border:2px solid rgba(0,0,0,.65);color:#fff;font:bold 10px monospace;overflow:hidden;pointer-events:none;
 text-shadow:1px 1px 0 #000;display:flex;align-items:flex-start;justify-content:flex-start;padding:1px 2px;line-height:1.1}
.inv-item.sel{outline:3px solid #fff;outline-offset:-3px;z-index:3}
.inv-item.lock{filter:grayscale(1) brightness(.6)}
.inv-item .cnt{position:absolute;right:1px;bottom:0;font-size:11px}
.inv-item .dur{position:absolute;left:2px;right:2px;bottom:2px;height:3px;background:#000}
.inv-item .dur>i{display:block;height:100%;background:var(--good)}
.inv-item .star{position:absolute;right:1px;top:0;color:#ffe070;font-size:11px}
.inv-col{display:flex;flex-direction:column;gap:8px;min-width:0}
.inv-grids.loadout{flex-wrap:nowrap}
.inv-col.left{flex:0 0 372px;width:372px}
.inv-col.right{flex:0 0 auto}
.inv-board{flex:0 0 auto}
.inv-slots{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:92px 92px 84px 84px;gap:4px;
 grid-template-areas:"helmet body vest" "spare body backpack" "p1 p1 sec" "p2 p2 melee"}
.inv-slot{position:relative;background:#101418;border:1px solid var(--line);overflow:hidden;min-width:0}
.inv-slot.a-body{grid-area:body}.inv-slot.a-helmet{grid-area:helmet}.inv-slot.a-vest{grid-area:vest}.inv-slot.a-backpack{grid-area:backpack}
.inv-slot.a-p1{grid-area:p1}.inv-slot.a-p2{grid-area:p2}.inv-slot.a-sec{grid-area:sec}.inv-slot.a-melee{grid-area:melee}
.inv-slot.a-spare{grid-area:spare;background:repeating-linear-gradient(135deg,#12171b 0 6px,#0d1114 6px 12px)}
.inv-slot .lbl{position:absolute;right:6px;top:3px;font-weight:bold;color:var(--dim);z-index:3;font-size:12px;text-shadow:1px 1px 0 #000}
.inv-slot .ghostchar{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;color:#1f272d;pointer-events:none}
.inv-item.fill{inset:0;left:0;top:0;width:100%;height:100%;font-size:12px;padding:18px 6px 6px;border-width:1px}
.inv-ghost{position:absolute;pointer-events:none;z-index:5;border:2px dashed #fff;opacity:.9}
.inv-ghost.ok{background:rgba(127,191,106,.5)}.inv-ghost.no{background:rgba(192,69,46,.55)}
`;

let injected = false;
export function ensureHubStyle() {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** 짧게 떴다 사라지는 알림 */
export function toast(root: HTMLElement, msg: string, bad = false) {
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), TUNING.hub.ui.messageMs);
}
