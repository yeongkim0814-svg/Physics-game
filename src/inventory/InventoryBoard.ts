import { TUNING } from '../config/tuning';
import { itemDef } from '../data/items';
import { describeItem } from '../hub/itemInfo';
import { maxDurOf } from '../hub/gear';
import { onTap } from '../ui/tap';
import {
  addItem, canMerge, canPlace, cloneInst, findPlaced, findSpot, footprint, itemAt, maxStack, newUid, placeAt, removeItem, sortGrid, splitStack,
  usedCells, type Grid, type ItemInstance,
} from './grid';

/**
 * 격자 인벤토리 UI (터치 우선). 여러 격자를 한 보드에 놓고 아이템을 옮긴다.
 *  - 탭으로 선택 → 탭으로 배치 (기본). 배치 가능=초록 / 불가=빨강 미리보기(마우스 hover·드래그 중·불가 탭 시)
 *  - 드래그도 지원 (임계 거리 이상 움직이면 드래그)
 *  - 도구: 회전, 자동 배치(다른 격자로), 수량(스택 분할), 버리기(옵션), 격자별 정렬
 * 격자 데이터(Grid)를 제자리에서 수정하고 onChange 로 알린다. 규칙(안전 보관함 등)은 accepts 로 주입한다.
 */
export interface BoardGrid {
  id: string;
  title: string;
  grid: Grid;
  /** 이 격자에 넣을 수 있는가: 거부 사유 또는 null (같은 격자 안 이동에는 호출 안 함) */
  accepts?: (inst: ItemInstance, fromId: string) => string | null;
  /** 이 격자에서 꺼낼 수 있는가: 거부 사유 또는 null */
  canTake?: (inst: ItemInstance) => string | null;
  /** 머리글 옆 보조 문구 */
  note?: string;
  /** loadout 레이아웃에서 놓일 열 (기본 left) */
  side?: 'left' | 'right';
  /**
   * 장비 칸(아이템 1개짜리 타일). 격자 데이터는 어댑터(큰 빈 Grid 하나에 (0,0) 고정)이고 화면은 한 타일로 그린다.
   * 이미 차 있는 칸에 다른 아이템을 놓으면 교체(기존 장비는 출발지로 돌아감). area 는 타일 배치 위치.
   */
  slot?: { label: string; glyph: string; area: 'helmet' | 'body' | 'vest' | 'backpack' | 'p1' | 'p2' | 'sec' | 'melee' };
}

export interface BoardOptions {
  grids: BoardGrid[];
  /** flat: 격자들을 나란히 / loadout: 왼쪽(장비 칸 + 가방·금고 섹션) | 오른쪽(창고) 2단 (Arena Breakout 식) */
  layout?: 'flat' | 'loadout';
  onChange: () => void;
  /** 잠긴 아이템(연구 중 등): 사유 또는 null */
  locked?: (inst: ItemInstance) => string | null;
  allowDiscard?: boolean;
  /** 버릴 수 없는 아이템 (사유 또는 null) */
  canDiscard?: (inst: ItemInstance) => string | null;
  onSelect?: (sel: { gridId: string; inst: ItemInstance } | null) => void;
  /** 선택 아이템에 대한 추가 버튼 (예: 장착) */
  extraActions?: (sel: { gridId: string; inst: ItemInstance } | null) => { label: string; run: () => void; disabled?: boolean }[];
}

export interface BoardHandle {
  el: HTMLElement;
  refresh(): void;
  selected(): { gridId: string; inst: ItemInstance } | null;
  deselect(): void;
  destroy(): void;
}

interface Down { gridId: string; pointerId: number; x: number; y: number; uid?: string; dragging: boolean }
interface Ghost { gridId: string; x: number; y: number; ok: boolean }

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const UI = TUNING.hub.ui;

export function createInventoryBoard(opts: BoardOptions): BoardHandle {
  const el = document.createElement('div');
  el.className = 'inv-board';
  let sel: { gridId: string; uid: string } | null = null;
  let selRot = false;
  let qty = 1;
  let down: Down | null = null;
  let ghost: Ghost | null = null;
  let discardArmed = false;
  let msgText = '';
  let msgTimer: ReturnType<typeof setTimeout> | undefined;
  let msgEl: HTMLElement | null = null;
  const gridEls = new Map<string, { el: HTMLElement; cell: number }>();
  const itemEls = new Map<string, HTMLElement>();

  const gridOf = (id: string) => opts.grids.find((g) => g.id === id)!;
  const isSlot = (id: string) => !!gridOf(id).slot;
  /** (fx,fy) 칸의 아이템. 장비 칸은 타일 어디를 눌러도 그 아이템 */
  const hitAt = (id: string, fx: number, fy: number) => (isSlot(id) ? gridOf(id).grid.placed[0] : itemAt(gridOf(id).grid, Math.floor(fx), Math.floor(fy)));
  /** 장비 칸/격자에 아이템을 넣는다 (자리는 호출 전에 확인) */
  function putIn(g: BoardGrid, inst: ItemInstance): boolean {
    if (g.slot) { placeAt(g.grid, inst, 0, 0, false); return true; }
    return !addItem(g.grid, inst);
  }
  const selected = () => {
    if (!sel) return null;
    const p = findPlaced(gridOf(sel.gridId).grid, sel.uid);
    return p ? { gridId: sel.gridId, inst: p.inst, placed: p } : null;
  };

  function say(text: string) {
    msgText = text;
    if (msgEl) msgEl.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgText = ''; if (msgEl) msgEl.textContent = ''; }, UI.messageMs);
  }

  function select(gridId: string | null, inst?: ItemInstance, placedRot = false) {
    sel = gridId && inst ? { gridId, uid: inst.uid } : null;
    selRot = placedRot;
    qty = inst ? inst.count : 1;
    ghost = null;
    discardArmed = false;
    opts.onSelect?.(sel && inst ? { gridId: sel.gridId, inst } : null);
    render();
  }

  // ---------- 배치 판정 ----------
  function evaluate(targetId: string, x: number, y: number, rot: boolean): { ok: boolean; reason?: string } {
    const s = selected();
    if (!s) return { ok: false };
    const t = gridOf(targetId);
    const same = targetId === s.gridId;
    if (t.slot) {
      if (same) return { ok: true };
      const why = t.accepts?.(s.inst, s.gridId);
      if (why) return { ok: false, reason: why };
      if (qty < s.inst.count) return { ok: false, reason: '장비 칸에는 1개만 넣을 수 있습니다' };
      const occ = t.grid.placed[0];
      if (occ) { // 교체: 기존 장비가 출발지로 돌아갈 수 있어야 한다
        const sg = gridOf(s.gridId);
        const out = t.canTake?.(occ.inst);
        if (out) return { ok: false, reason: out };
        const back = sg.accepts?.(occ.inst, targetId);
        if (back) return { ok: false, reason: `교체 불가: ${back}` };
        if (!sg.slot && !findSpot(sg.grid, occ.inst, s.inst.uid)) return { ok: false, reason: '교체된 장비를 둘 공간이 없습니다' };
      }
      return { ok: true };
    }
    if (!same) {
      const why = t.accepts?.(s.inst, s.gridId);
      if (why) return { ok: false, reason: why };
    }
    const moving = qty < s.inst.count ? { ...s.inst, count: qty } : s.inst;
    if (!canPlace(t.grid, moving, x, y, rot, same && qty >= s.inst.count ? s.inst.uid : undefined)) {
      return { ok: false, reason: '공간이 부족하거나 겹칩니다' };
    }
    return { ok: true };
  }

  function commit(targetId: string, x: number, y: number, rot: boolean): boolean {
    const s = selected();
    if (!s) return false;
    const ev = evaluate(targetId, x, y, rot);
    if (!ev.ok) { if (ev.reason) say(ev.reason); return false; }
    const src = gridOf(s.gridId), dst = gridOf(targetId);
    if (dst.slot) {
      if (s.gridId === targetId) { select(null); return true; }
      const occ = dst.grid.placed[0];
      removeItem(src.grid, s.inst.uid);
      if (occ) { removeItem(dst.grid, occ.inst.uid); putIn(src, occ.inst); }
      placeAt(dst.grid, s.inst, 0, 0, false);
      sel = null;
      opts.onSelect?.(null);
      ghost = null;
      opts.onChange();
      render();
      return true;
    }
    if (qty >= s.inst.count) {
      if (s.gridId === targetId) { s.placed.x = x; s.placed.y = y; s.placed.rot = rot; }
      else { removeItem(src.grid, s.inst.uid); placeAt(dst.grid, s.inst, x, y, rot); }
      sel = null;
      opts.onSelect?.(null);
    } else {
      const part = splitStack(s.inst, qty);
      placeAt(dst.grid, part, x, y, rot);
      qty = Math.min(qty, s.inst.count);
    }
    ghost = null;
    opts.onChange();
    render();
    return true;
  }

  /** n 개를 dest 격자로 보낸다(스택 합치기 포함, 못 들어간 만큼은 출발 격자에 남는다). 실제 이동한 수량 반환 */
  function transfer(srcId: string, inst: ItemInstance, n: number, destId: string): number {
    const src = gridOf(srcId), dst = gridOf(destId);
    if (dst.slot) { // 비어 있는 장비 칸에 1개
      if (dst.grid.placed.length || inst.count > 1) return 0;
      removeItem(src.grid, inst.uid);
      placeAt(dst.grid, inst, 0, 0, false);
      return 1;
    }
    const want = Math.min(n, inst.count);
    // 스택은 새 uid 로 나눠 보낸다. 상태가 있는 단일 아이템(무기 등)은 uid 를 유지해야 연구 잠금 등이 따라간다
    const moving: ItemInstance = { ...cloneInst(inst), uid: maxStack(inst) > 1 ? newUid() : inst.uid, count: want };
    const rest = addItem(dst.grid, moving);
    const moved = want - (rest ? rest.count : 0);
    inst.count -= moved;
    if (inst.count <= 0) removeItem(src.grid, inst.uid);
    return moved;
  }

  function autoPlace() {
    const s = selected();
    if (!s) return;
    // 장비 칸(비어 있는 것)이 맞으면 먼저, 그다음 다른 격자들
    const targets = opts.grids.filter((g) => g.id !== s.gridId && !(g.slot && isSlot(s.gridId))).sort((a, b) => Number(!!b.slot) - Number(!!a.slot));
    let reason = '';
    for (const t of targets) {
      if (t.slot && t.grid.placed.length) continue;
      const why = t.accepts?.(s.inst, s.gridId);
      if (why) { reason = why; continue; }
      const moved = transfer(s.gridId, s.inst, qty, t.id);
      if (moved > 0) {
        say(`${t.title}(으)로 ${itemDef(s.inst.defId).name}${moved > 1 ? ` ${moved}개` : ''} 이동`);
        opts.onChange();
        const still = findPlaced(gridOf(s.gridId).grid, s.inst.uid);
        select(still ? s.gridId : null, still?.inst, still?.rot);
        return;
      }
      reason = `${t.title}에 공간이 없습니다`;
    }
    say(reason || '옮길 격자가 없습니다');
  }

  function rotate() {
    if (!selected()) return;
    selRot = !selRot;
    if (ghost) { const e = evaluate(ghost.gridId, ghost.x, ghost.y, selRot); ghost.ok = e.ok; }
    render();
  }

  function discard() {
    const s = selected();
    if (!s) return;
    const why = opts.canDiscard?.(s.inst);
    if (why) { say(why); return; }
    if (!discardArmed) { discardArmed = true; say('한 번 더 누르면 버립니다'); render(); return; }
    const g = gridOf(s.gridId).grid;
    if (qty >= s.inst.count) removeItem(g, s.inst.uid); else s.inst.count -= qty;
    say(`${itemDef(s.inst.defId).name} 버림`);
    discardArmed = false;
    opts.onChange();
    const still = findPlaced(g, s.inst.uid);
    select(still ? s.gridId : null, still?.inst, still?.rot);
  }

  // ---------- 포인터 ----------
  const cellAt = (gridId: string, cx: number, cy: number) => {
    const ge = gridEls.get(gridId)!;
    const r = ge.el.getBoundingClientRect();
    const cell = isSlot(gridId) ? Math.max(1, r.width) : ge.cell; // 장비 칸은 타일 폭 기준(항상 (0,0))
    return { fx: (cx - r.left) / cell, fy: (cy - r.top) / cell, inside: cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom };
  };
  const gridAtPoint = (cx: number, cy: number): string | null => {
    for (const id of gridEls.keys()) if (cellAt(id, cx, cy).inside) return id;
    return null;
  };
  /** 포인터가 선택 아이템의 중심에 오도록 한 좌상단 칸 */
  function anchorFor(gridId: string, cx: number, cy: number) {
    if (isSlot(gridId)) return { x: 0, y: 0 };
    const s = selected()!;
    const f = footprint(s.inst, selRot);
    const c = cellAt(gridId, cx, cy);
    return { x: Math.round(c.fx - f.w / 2), y: Math.round(c.fy - f.h / 2) };
  }

  function showGhost(gridId: string, x: number, y: number) {
    const e = evaluate(gridId, x, y, selRot);
    ghost = { gridId, x, y, ok: e.ok };
    drawGhost();
  }
  function drawGhost() {
    for (const ge of gridEls.values()) ge.el.querySelector('.inv-ghost')?.remove();
    const s = selected();
    if (!ghost || !s) return;
    const ge = gridEls.get(ghost.gridId)!;
    const f = footprint(s.inst, selRot);
    const d = document.createElement('div');
    d.className = `inv-ghost ${ghost.ok ? 'ok' : 'no'}`;
    d.style.cssText = isSlot(ghost.gridId)
      ? 'left:0;top:0;width:100%;height:100%'
      : `left:${ghost.x * ge.cell}px;top:${ghost.y * ge.cell}px;width:${f.w * ge.cell}px;height:${f.h * ge.cell}px`;
    ge.el.appendChild(d);
  }

  function onDown(gridId: string, e: PointerEvent) {
    e.stopPropagation();
    const c = cellAt(gridId, e.clientX, e.clientY);
    const hit = hitAt(gridId, c.fx, c.fy);
    down = { gridId, pointerId: e.pointerId, x: e.clientX, y: e.clientY, uid: hit?.inst.uid, dragging: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
  }

  function onMove(gridId: string, e: PointerEvent) {
    if (!down) {
      // 마우스 hover 미리보기
      if (e.pointerType === 'mouse' && selected()) {
        const a = anchorFor(gridId, e.clientX, e.clientY);
        showGhost(gridId, a.x, a.y);
      }
      return;
    }
    if (e.pointerId !== down.pointerId) return;
    if (!down.dragging) {
      if (!down.uid || Math.hypot(e.clientX - down.x, e.clientY - down.y) < UI.dragThreshold) return;
      // 드래그 시작: 해당 아이템 선택
      const p = findPlaced(gridOf(down.gridId).grid, down.uid)!;
      const why = lockReason(down.gridId, p.inst);
      if (why) { say(why); down = null; return; }
      if (!sel || sel.uid !== down.uid) {
        sel = { gridId: down.gridId, uid: down.uid };
        selRot = p.rot;
        qty = p.inst.count;
        opts.onSelect?.({ gridId: down.gridId, inst: p.inst });
        // 드래그 중 DOM 을 다시 만들면 터치의 캡처 대상이 사라져 이후 이벤트가 끊긴다 → 표시만 제자리에서 갱신
        for (const n of el.querySelectorAll('.inv-item.sel')) n.classList.remove('sel');
        itemEls.get(p.inst.uid)?.classList.add('sel');
      }
      down.dragging = true;
    }
    const target = gridAtPoint(e.clientX, e.clientY);
    if (!target) { ghost = null; drawGhost(); return; }
    const a = anchorFor(target, e.clientX, e.clientY);
    showGhost(target, a.x, a.y);
  }

  function onUp(gridId: string, e: PointerEvent) {
    if (!down || e.pointerId !== down.pointerId) return;
    const d = down;
    down = null;
    if (d.dragging) {
      const target = gridAtPoint(e.clientX, e.clientY);
      if (target) {
        const a = anchorFor(target, e.clientX, e.clientY);
        if (commit(target, a.x, a.y, selRot)) return;
      }
      ghost = null;
      render();
      return;
    }
    tap(gridId, e);
  }

  const lockReason = (gridId: string, inst: ItemInstance) => opts.locked?.(inst) ?? gridOf(gridId).canTake?.(inst) ?? null;

  function tap(gridId: string, e: PointerEvent) {
    const g = gridOf(gridId);
    const c = cellAt(gridId, e.clientX, e.clientY);
    const hit = hitAt(gridId, c.fx, c.fy);
    const s = selected();

    if (hit && s && hit.inst.uid === s.inst.uid) {
      // 자기 자신 탭: 회전이 대기 중이면 제자리 회전, 아니면 선택 해제
      if (selRot !== s.placed.rot) {
        if (commit(gridId, s.placed.x, s.placed.y, selRot)) return;
        return;
      }
      select(null);
      return;
    }
    if (g.slot && s && s.inst.uid !== hit?.inst.uid) { commit(gridId, 0, 0, false); return; } // 장비 칸 탭: 장착/교체
    if (hit && s && canMerge(s.inst, hit.inst) && hit.inst.uid !== s.inst.uid) {
      // 같은 종류 스택 위 탭 → 합치기
      const why = gridId !== s.gridId ? g.accepts?.(s.inst, s.gridId) : null;
      if (why) { say(why); return; }
      const n = Math.min(qty, maxStack(hit.inst) - hit.inst.count);
      s.inst.count -= n; hit.inst.count += n;
      if (s.inst.count <= 0) removeItem(gridOf(s.gridId).grid, s.inst.uid);
      opts.onChange();
      const still = findPlaced(gridOf(s.gridId).grid, s.inst.uid);
      select(still ? s.gridId : null, still?.inst, still?.rot);
      return;
    }
    if (hit) {
      const why = lockReason(gridId, hit.inst);
      if (why) { say(why); return; }
      select(gridId, hit.inst, hit.rot);
      return;
    }
    if (!s) return;
    const a = anchorFor(gridId, e.clientX, e.clientY);
    if (UI.tapConfirm && !(ghost && ghost.gridId === gridId && ghost.x === a.x && ghost.y === a.y && ghost.ok)) {
      showGhost(gridId, a.x, a.y);
      return;
    }
    if (!commit(gridId, a.x, a.y, selRot)) showGhost(gridId, a.x, a.y); // 불가: 빨간 미리보기를 남긴다
  }

  // ---------- 그리기 ----------
  function cellSizeFor(g: Grid) {
    const avail = innerHeight - UI.boardReservePx;
    return Math.max(UI.minCellPx, Math.min(UI.cellPx, Math.floor(avail / g.h)));
  }

  function itemEl(p: { inst: ItemInstance; x: number; y: number; rot: boolean }, cell: number, locked: boolean, selectedUid?: string) {
    const d = itemDef(p.inst.defId);
    const f = footprint(p.inst, p.rot);
    const div = document.createElement('div');
    div.className = `inv-item${selectedUid === p.inst.uid ? ' sel' : ''}${locked ? ' lock' : ''}`;
    div.style.cssText = `left:${p.x * cell}px;top:${p.y * cell}px;width:${f.w * cell}px;height:${f.h * cell}px;background:${hex(d.color)}`;
    div.textContent = f.w * f.h === 1 ? d.name.slice(0, 1) : d.name;
    if (p.inst.count > 1) { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = String(p.inst.count); div.appendChild(c); }
    if (p.inst.found) { const s = document.createElement('span'); s.className = 'star'; s.textContent = '★'; div.appendChild(s); }
    const max = maxDurOf(p.inst);
    if (max) {
      const ratio = Math.max(0, Math.min(1, (p.inst.dur ?? 0) / max));
      const bar = document.createElement('div');
      bar.className = 'dur';
      bar.innerHTML = `<i style="width:${ratio * 100}%;${ratio < 0.25 ? 'background:var(--bad)' : ''}"></i>`;
      div.appendChild(bar);
    }
    return div;
  }

  function btn(label: string, fn: () => void, cls = '', disabled = false) {
    const b = document.createElement('button');
    b.className = `btn sm ${cls}${disabled ? ' off' : ''}`;
    b.textContent = label;
    if (!disabled) onTap(b, fn);
    return b;
  }

  function render() {
    const s = selected();
    if (sel && !s) { sel = null; opts.onSelect?.(null); }
    el.innerHTML = '';
    gridEls.clear();
    itemEls.clear();

    // 도구줄
    const tools = document.createElement('div');
    tools.className = 'inv-tools';
    const info = document.createElement('div');
    info.className = 'inv-info';
    if (s) {
      const di = describeItem(s.inst);
      const hint = selRot !== s.placed.rot ? ' <span class="warn">[회전 대기]</span>' : '';
      info.innerHTML = `<b>${di.title}</b>${hint}<br>${di.lines.slice(0, 4).join('<br>')}`;
    } else info.innerHTML = '아이템을 탭해 선택 → 빈 칸을 탭해 배치. 끌어서 옮길 수도 있습니다.';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:var(--warn);font-weight:bold;min-height:16px';
    msg.textContent = msgText;
    msgEl = msg;
    info.appendChild(msg);
    tools.appendChild(info);
    if (s) {
      tools.appendChild(btn('회전 ↻', rotate, '', itemDef(s.inst.defId).w === itemDef(s.inst.defId).h));
      const others = opts.grids.filter((g) => g.id !== s.gridId && !(g.slot && isSlot(s.gridId)));
      tools.appendChild(btn(others.length ? `자동 배치 → ${others.map((g) => g.title).join('/')}` : '자동 배치', autoPlace, '', !others.length));
      if (itemDef(s.inst.defId).stack > 1 && s.inst.count > 1) tools.appendChild(qtyStepper(s.inst));
      if (opts.allowDiscard) tools.appendChild(btn(discardArmed ? '정말 버리기?' : '버리기', discard, 'danger'));
      for (const a of opts.extraActions?.({ gridId: s.gridId, inst: s.inst }) ?? []) tools.appendChild(btn(a.label, a.run, 'pri', a.disabled));
      tools.appendChild(btn('선택 해제', () => select(null)));
    }
    el.appendChild(tools);

    // 격자/장비 칸들
    const bind = (node: HTMLElement, id: string) => {
      node.addEventListener('pointerdown', (e) => onDown(id, e));
      node.addEventListener('pointermove', (e) => onMove(id, e));
      node.addEventListener('pointerup', (e) => onUp(id, e));
      node.addEventListener('pointercancel', () => { down = null; ghost = null; drawGhost(); });
      node.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !down) { ghost = null; drawGhost(); } });
    };

    /** 장비 칸 타일: 모서리에 이름표, 비어 있으면 흐린 실루엣 글자, 차 있으면 아이템이 타일을 채운다 */
    const slotTile = (bg: BoardGrid) => {
      const tile = document.createElement('div');
      tile.className = `inv-slot a-${bg.slot!.area}`;
      tile.style.touchAction = 'none';
      const label = document.createElement('div');
      label.className = 'lbl';
      label.textContent = bg.slot!.label;
      tile.appendChild(label);
      const occ = bg.grid.placed[0];
      if (occ) {
        const d = itemDef(occ.inst.defId);
        const box = document.createElement('div');
        box.className = `inv-item fill${sel?.uid === occ.inst.uid ? ' sel' : ''}${lockReason(bg.id, occ.inst) ? ' lock' : ''}`;
        box.style.background = hex(d.color);
        box.textContent = d.name;
        const max = maxDurOf(occ.inst);
        if (max) {
          const ratio = Math.max(0, Math.min(1, (occ.inst.dur ?? 0) / max));
          const bar = document.createElement('div');
          bar.className = 'dur';
          bar.innerHTML = `<i style="width:${ratio * 100}%;${ratio < 0.25 ? 'background:var(--bad)' : ''}"></i>`;
          box.appendChild(bar);
        }
        itemEls.set(occ.inst.uid, box);
        tile.appendChild(box);
      } else {
        const g = document.createElement('div');
        g.className = 'ghostchar';
        g.textContent = bg.slot!.glyph;
        tile.appendChild(g);
      }
      bind(tile, bg.id);
      return tile;
    };

    const gridPanel = (bg: BoardGrid, fit: boolean) => {
      const cell = fit ? cellSizeFor(bg.grid) : UI.cellPx;
      const panel = document.createElement('div');
      panel.className = 'inv-panel';
      const head = document.createElement('div');
      head.className = 'inv-head';
      const used = usedCells(bg.grid);
      head.innerHTML = `<span>${bg.title}</span><span class="dim">${used}/${bg.grid.w * bg.grid.h}칸</span>${bg.note ? `<span class="dim">${bg.note}</span>` : ''}<span class="sp"></span>`;
      head.appendChild(btn('정렬', () => { say(sortGrid(bg.grid) ? `${bg.title} 정렬` : '정렬할 공간이 부족합니다'); opts.onChange(); select(null); }));
      panel.appendChild(head);
      const scroll = document.createElement('div');
      scroll.className = 'inv-scroll';
      const limit = innerHeight - UI.boardReservePx + 6;
      if (fit) scroll.style.maxHeight = `${limit}px`;
      const needScroll = fit && cell * bg.grid.h > limit - 4;
      const ge = document.createElement('div');
      ge.className = 'inv-grid drag';
      ge.style.cssText = `width:${bg.grid.w * cell}px;height:${bg.grid.h * cell}px;--cell:${cell}px;touch-action:${needScroll ? 'pan-y' : 'none'}`;
      for (const p of bg.grid.placed) {
        const ie = itemEl(p, cell, !!lockReason(bg.id, p.inst), sel?.uid);
        itemEls.set(p.inst.uid, ie);
        ge.appendChild(ie);
      }
      bind(ge, bg.id);
      scroll.appendChild(ge);
      panel.appendChild(scroll);
      gridEls.set(bg.id, { el: ge, cell });
      return panel;
    };

    const wrap = document.createElement('div');
    wrap.className = 'inv-grids';
    if (opts.layout === 'loadout') {
      wrap.classList.add('loadout');
      const left = document.createElement('div');
      left.className = 'inv-col left';
      const right = document.createElement('div');
      right.className = 'inv-col right';
      const slots = opts.grids.filter((g) => g.slot);
      if (slots.length) {
        const block = document.createElement('div');
        block.className = 'inv-slots';
        for (const bg of slots) {
          const tile = slotTile(bg);
          block.appendChild(tile);
          gridEls.set(bg.id, { el: tile, cell: Math.max(1, tile.offsetWidth || 120) });
        }
        const spare = document.createElement('div');
        spare.className = 'inv-slot a-spare';
        block.appendChild(spare);
        left.appendChild(block);
      }
      for (const bg of opts.grids.filter((g) => !g.slot)) (bg.side === 'right' ? right : left).appendChild(gridPanel(bg, bg.side === 'right'));
      wrap.append(left, right);
    } else {
      for (const bg of opts.grids) wrap.appendChild(bg.slot ? slotTile(bg) : gridPanel(bg, true));
    }
    el.appendChild(wrap);
  }

  function qtyStepper(inst: ItemInstance) {
    const box = document.createElement('div');
    box.className = 'row';
    box.style.cssText = 'gap:4px;align-items:center';
    const set = (n: number) => { qty = Math.max(1, Math.min(inst.count, n)); render(); };
    box.appendChild(btn('−10', () => set(qty - 10)));
    box.appendChild(btn('−1', () => set(qty - 1)));
    const t = document.createElement('span');
    t.textContent = `${qty}/${inst.count}`;
    t.style.cssText = 'min-width:56px;text-align:center;font-weight:bold';
    box.appendChild(t);
    box.appendChild(btn('+1', () => set(qty + 1)));
    box.appendChild(btn('+10', () => set(qty + 10)));
    box.appendChild(btn('전체', () => set(inst.count)));
    return box;
  }

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected) return;
    if (e.code === 'KeyR') rotate();
    else if (e.code === 'Escape') select(null);
  };
  addEventListener('keydown', onKey);
  const onResize = () => { if (el.isConnected && !down) render(); };
  addEventListener('resize', onResize);

  render();
  return {
    el,
    refresh: () => { if (!down) render(); },
    selected: () => { const s = selected(); return s ? { gridId: s.gridId, inst: s.inst } : null; },
    deselect: () => select(null),
    destroy: () => { removeEventListener('keydown', onKey); removeEventListener('resize', onResize); clearTimeout(msgTimer); },
  };
}
