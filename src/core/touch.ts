import { TOUCH } from '../config/settings';
import { SPRINT_IDLE, autoSprintOnRelease, hitCircle, stalePointerIds, stepSprint, type SprintState } from './touchMath';

type ButtonId = keyof typeof TOUCH.buttons;
type Role = ButtonId | 'move' | 'look' | 'ignored';
interface Ptr { role: Role; x: number; y: number; type: string }

const S = TOUCH.sprint;
const J = TOUCH.joystick;
const BUTTON_IDS = Object.keys(TOUCH.buttons) as ButtonId[];
const GREEN = 'rgba(127,191,106,0.95)';
const WHITE = 'rgba(255,255,255,0.35)';

/** 브라우저 기본 제스처(스크롤·확대·길게 누르기 메뉴·당겨서 새로고침) 차단 */
export function lockBrowserGestures() {
  const stop = (e: Event) => e.preventDefault();
  addEventListener('touchmove', stop, { passive: false });
  addEventListener('contextmenu', stop);
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) addEventListener(ev, stop);
}

/**
 * 멀티터치: 손가락(pointerId)마다 역할을 배정하는 "포인터 표" 하나로 관리한다.
 *  - 시작(pointerdown)만 터치 레이어에서 받아 화면 좌표로 역할을 정한다 (버튼은 DOM 이벤트가 아니라 좌표 적중). 이동/끝은 window 에서
 *    받으므로 포인터 캡처나 이벤트 대상 요소에 의존하지 않는다
 *  - 조이스틱 손가락 1개(왼쪽 영역), 시점 손가락 1개는 독립. 조이스틱이 있을 때 왼쪽 영역의 두 번째 손가락은 시점으로 쓴다
 *  - 버튼은 손가락 집합으로 추적: 같은 버튼을 여러 손가락이 눌러도 모두 떼야 해제. FIRE 를 누른 손가락을 끌면 시점이 돈다
 *  - 놓친 pointerup 은 touchend/touchcancel 때 실제 접촉 목록과 대조해 복구하고, 포커스를 잃으면 전부 초기화한다
 *  - 전력질주: 조이스틱 y ≥ start 이면 전력질주(내리면 해제). auto 이상까지 갔다가 손을 떼면 자동 전력질주(손잡이는 림 위쪽에 고정),
 *    자동 전력질주 중 왼쪽 영역을 다시 터치하면 취소하고 그 터치의 조작을 따른다
 * 상태는 폴링: move*, look*(프레임마다 누적 후 endFrame 에서 0), fire/jump/swap.
 */
export class TouchControls {
  enabled = false;
  lookDX = 0;
  lookDY = 0;
  fireClicked = false;
  jumpPressed = false;
  swapPressed = false;
  weaponPressed = false;
  /** 자동 전력질주 (손을 떼도 유지) */
  sprintLocked = false;
  /** 조이스틱을 누른 채 y ≥ start 인 동안의 전력질주 */
  private sprintState: SprintState = SPRINT_IDLE;
  /** 화면 진단 표시 (기기에서 실제로 어떤 터치가 들어오는지 확인용) */
  debug = false;

  private rawX = 0;
  private rawY = 0;
  private ptrs = new Map<number, Ptr>();
  private held = Object.fromEntries(BUTTON_IDS.map((id) => [id, new Set<number>()])) as Record<ButtonId, Set<number>>;
  private buttonEls = new Map<ButtonId, HTMLDivElement>();
  private movePtr = -1;
  private lookPtr = -1;
  private origin = { x: 0, y: 0 };
  private stats = { down: 0, up: 0, cancel: 0, healed: 0, max: 0, ignored: 0 };

  private layer: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private lockHint: HTMLDivElement;
  private debugEl: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:fixed;inset:0;z-index:10;touch-action:none;display:none';
    root.appendChild(this.layer);

    this.base = this.circle(J.radius * 2, 'rgba(255,255,255,0.12)');
    this.knob = this.circle(J.knobSize, 'rgba(255,255,255,0.35)');
    this.lockHint = this.circle(S.hintSize, 'rgba(127,191,106,0.35)');
    this.lockHint.textContent = '▲▲';
    this.lockHint.style.cssText += ';align-items:center;justify-content:center;color:#fff;font:bold 12px monospace';
    this.base.style.display = this.knob.style.display = this.lockHint.style.display = 'none';
    this.layer.append(this.base, this.knob, this.lockHint);

    for (const id of BUTTON_IDS) this.makeButton(id);

    this.debugEl = document.createElement('div');
    this.debugEl.style.cssText = 'position:fixed;z-index:25;left:8px;bottom:8px;font:11px monospace;color:#ff8;' +
      'background:rgba(0,0,0,0.55);padding:4px 6px;white-space:pre;pointer-events:none;display:none';
    root.appendChild(this.debugEl);

    // 시작은 레이어(DOM 적중 → 화면 위 버튼들은 그대로 클릭 가능), 이동/끝은 window
    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e), true);
    addEventListener('pointerup', (e) => this.onEnd(e, false), true);
    addEventListener('pointercancel', (e) => this.onEnd(e, true), true);
    // 놓친 pointerup 복구
    for (const ev of ['touchend', 'touchcancel'] as const) {
      addEventListener(ev, (e) => this.reconcile(e as TouchEvent), { capture: true, passive: true });
    }
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });

    // 터치가 주 입력이면 즉시, 아니면 첫 터치가 들어올 때 활성화
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    else addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  get moveX() { return this.rawX; }
  /** 전력질주 잠금 중에는 손을 떼도 전진 입력 1 */
  get moveY() { return this.sprintLocked ? 1 : this.rawY; }
  get fireHeld() { return this.held.fire.size > 0; }
  /** 전력질주 중인가 (눌려서 start 이상 / 자동 전력질주) */
  get sprinting() { return this.sprintLocked || this.sprintState.sprinting; }

  toggleDebug() {
    this.debug = !this.debug;
    this.debugEl.style.display = this.debug ? 'block' : 'none';
  }

  private enable() {
    this.enabled = true;
    this.layer.style.display = 'block';
  }

  private circle(size: number, bg: string) {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;width:${size}px;height:${size}px;border-radius:50%;background:${bg};` +
      `border:2px solid ${WHITE};pointer-events:none;box-sizing:border-box`;
    return d;
  }

  private setButtonVisual(id: ButtonId, down: boolean) {
    const b = this.buttonEls.get(id);
    if (b) b.style.background = `rgba(255,255,255,${down ? 0.6 : TOUCH.buttonOpacity * 0.5})`;
  }

  /** 버튼은 표시 전용(pointer-events:none). 눌림은 좌표로 판정한다 */
  private makeButton(id: ButtonId) {
    const c = TOUCH.buttons[id];
    const b = document.createElement('div');
    b.textContent = c.label;
    b.style.cssText = `position:fixed;right:${c.right}px;bottom:${c.bottom}px;width:${c.size}px;height:${c.size}px;` +
      `border-radius:50%;background:rgba(255,255,255,${TOUCH.buttonOpacity * 0.5});border:2px solid rgba(255,255,255,${TOUCH.buttonOpacity});` +
      `color:#fff;font:bold ${Math.round(c.size / 6)}px monospace;display:flex;align-items:center;justify-content:center;` +
      'box-sizing:border-box;pointer-events:none;user-select:none';
    this.buttonEls.set(id, b);
    this.layer.appendChild(b);
  }

  private buttonAt(x: number, y: number): ButtonId | null {
    return hitCircle(x, y, BUTTON_IDS.map((id) => {
      const c = TOUCH.buttons[id];
      return { key: id, cx: innerWidth - c.right - c.size / 2, cy: innerHeight - c.bottom - c.size / 2, r: c.size / 2 };
    }), TOUCH.buttonSlop);
  }

  private place(el: HTMLElement, x: number, y: number) {
    const s = parseFloat(el.style.width);
    el.style.left = `${x - s / 2}px`;
    el.style.top = `${y - s / 2}px`;
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    this.stats.down++;
    if (this.ptrs.has(e.pointerId)) this.drop(e.pointerId); // 놓친 up 으로 id 가 재사용된 경우

    const inMoveZone = e.clientX < innerWidth * TOUCH.moveZoneWidth;
    // 전력질주 잠금 중 왼쪽(조이스틱) 영역을 다시 터치하면 해제
    if (inMoveZone && this.sprintLocked) this.setSprintLock(false);

    let role: Role = 'ignored';
    const btn = this.buttonAt(e.clientX, e.clientY);
    if (btn) {
      role = btn;
      this.held[btn].add(e.pointerId);
      this.setButtonVisual(btn, true);
      if (btn === 'fire') this.fireClicked = true;
      else if (btn === 'jump') this.jumpPressed = true;
      else if (btn === 'weapon') this.weaponPressed = true;
      else this.swapPressed = true;
    } else if (inMoveZone && this.movePtr === -1) {
      role = 'move';
      this.movePtr = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.place(this.base, e.clientX, e.clientY);
      this.place(this.knob, e.clientX, e.clientY);
      this.base.style.display = this.knob.style.display = 'block';
      this.lockHint.style.display = 'none';
      this.sprintState = SPRINT_IDLE;
      this.refreshStick();
    } else if (this.lookPtr === -1) {
      role = 'look'; // 오른쪽 영역, 또는 조이스틱 손가락이 이미 있는 왼쪽 영역의 두 번째 손가락
      this.lookPtr = e.pointerId;
    } else {
      this.stats.ignored++;
    }
    this.ptrs.set(e.pointerId, { role, x: e.clientX, y: e.clientY, type: e.pointerType });
    this.stats.max = Math.max(this.stats.max, this.ptrs.size);
  }

  private onMove(e: PointerEvent) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dxPx = e.clientX - p.x, dyPx = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (p.role === 'look' || p.role === 'fire') {
      // FIRE 를 누른 손가락을 끌면 시점도 돈다 (한 손으로 쏘면서 조준)
      this.lookDX += dxPx * TOUCH.lookSensitivity;
      this.lookDY += dyPx * TOUCH.lookSensitivity;
    } else if (p.role === 'move') {
      let dx = (p.x - this.origin.x) / J.radius;
      let dy = (p.y - this.origin.y) / J.radius;
      const mag = Math.hypot(dx, dy);

      // y(위가 +)로 전력질주 판정: 시작 값 이상이면 전력질주, 더 올려 손을 떼면 자동 전력질주
      const prev = this.sprintState;
      const next = stepSprint(prev, -dy, S);
      if (next.sprinting !== prev.sprinting || next.armed !== prev.armed) {
        this.sprintState = next;
        if (next.armed && !prev.armed) { try { navigator.vibrate?.(S.vibrateMs); } catch { /* 진동 미지원: 무시 */ } }
        this.refreshStick();
      }

      if (mag > 1) { dx /= mag; dy /= mag; }
      const m = Math.min(mag, 1);
      const scale = m < J.deadzone ? 0 : (m - J.deadzone) / (1 - J.deadzone) / (m || 1);
      this.rawX = dx * scale;
      this.rawY = -dy * scale;
      this.place(this.knob, this.origin.x + dx * J.radius, this.origin.y + dy * J.radius);
    }
  }

  private onEnd(e: PointerEvent, cancelled: boolean) {
    if (!this.ptrs.has(e.pointerId)) return;
    if (cancelled) this.stats.cancel++; else this.stats.up++;
    this.drop(e.pointerId);
  }

  /** 포인터 하나를 표에서 빼고 그 역할의 상태를 정리 */
  private drop(id: number, allowAuto = true) {
    const p = this.ptrs.get(id);
    if (!p) return;
    this.ptrs.delete(id);
    if (p.role === 'move') {
      this.movePtr = -1;
      this.rawX = this.rawY = 0;
      this.lockHint.style.display = 'none';
      // 전력질주 중 자동 값 이상에서 손을 떼면 자동 전력질주
      const auto = allowAuto && autoSprintOnRelease(this.sprintState);
      this.sprintState = SPRINT_IDLE;
      if (auto) this.setSprintLock(true);
      else { this.refreshStick(); this.base.style.display = this.knob.style.display = 'none'; }
    } else if (p.role === 'look') {
      this.lookPtr = -1;
    } else if (p.role !== 'ignored') {
      this.held[p.role].delete(id);
      if (this.held[p.role].size === 0) this.setButtonVisual(p.role, false);
    }
  }

  /** touchend/touchcancel 때 실제 접촉 목록과 대조해, 접촉이 없는데 남아 있는 포인터(놓친 pointerup)를 정리 */
  private reconcile(e: TouchEvent) {
    const live = Array.from(e.touches, (t) => ({ x: t.clientX, y: t.clientY }));
    const tracked = new Map<number, { x: number; y: number }>();
    for (const [id, p] of this.ptrs) if (p.type !== 'mouse') tracked.set(id, p);
    for (const id of stalePointerIds(tracked, live, TOUCH.reconcileTolerance)) {
      this.stats.healed++;
      this.drop(id);
    }
  }

  /** 조이스틱 표시 갱신: 전력질주 중이면 녹색, 자동 전력질주 대기 중이면 더 진하게 + 목표 표시 */
  private refreshStick() {
    const { sprinting, armed } = this.sprintState;
    const green = sprinting || this.sprintLocked;
    this.base.style.borderColor = this.knob.style.borderColor = green ? GREEN : WHITE;
    this.knob.style.background = armed || this.sprintLocked ? 'rgba(127,191,106,0.75)' : sprinting ? 'rgba(127,191,106,0.45)' : 'rgba(255,255,255,0.35)';
    // 전력질주 중에는 자동 전력질주로 이어지는 위치를 조이스틱 위쪽에 표시
    this.lockHint.style.display = sprinting && this.movePtr !== -1 ? 'flex' : 'none';
    if (sprinting) this.place(this.lockHint, this.origin.x, this.origin.y - S.auto * J.radius);
    this.lockHint.style.background = armed ? 'rgba(127,191,106,0.85)' : 'rgba(127,191,106,0.35)';
  }

  private setSprintLock(on: boolean) {
    if (this.sprintLocked === on) return;
    this.sprintLocked = on;
    this.lockHint.style.display = 'none';
    this.refreshStick();
    if (on) {
      // 손잡이를 림 위쪽 끝에 고정해 자동 전력질주 중임을 표시
      this.base.style.display = this.knob.style.display = 'block';
      this.place(this.knob, this.origin.x, this.origin.y - J.radius);
    } else if (this.movePtr === -1) {
      this.base.style.display = this.knob.style.display = 'none';
    }
  }

  /** 포커스 상실/탭 전환: 눌린 채 남는 입력(발사, 이동, 잠금)을 전부 해제 */
  releaseAll() {
    for (const id of [...this.ptrs.keys()]) this.drop(id, false);
    this.sprintState = SPRINT_IDLE;
    this.setSprintLock(false);
    this.base.style.display = this.knob.style.display = this.lockHint.style.display = 'none';
  }

  private debugText(): string {
    const rows = [...this.ptrs].map(([id, p]) => `${id}:${p.role}(${Math.round(p.x)},${Math.round(p.y)})`);
    const s = this.stats;
    return `touch ${this.ptrs.size}/${s.max}max  ${rows.join(' ') || '-'}\n` +
      `down ${s.down} up ${s.up} cancel ${s.cancel} healed ${s.healed} ignored ${s.ignored}  ` +
      `fire ${this.fireHeld ? 'ON' : '-'} sprint ${this.sprintLocked ? 'AUTO' : this.sprintState.armed ? 'ARMED' : this.sprintState.sprinting ? 'ON' : '-'}`;
  }

  endFrame() {
    this.lookDX = this.lookDY = 0;
    this.fireClicked = this.jumpPressed = this.swapPressed = this.weaponPressed = false;
    if (this.debug) this.debugEl.textContent = this.debugText();
  }
}
