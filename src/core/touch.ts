import { TOUCH } from '../config/settings';
import { inSprintZone } from './touchMath';

type ButtonId = keyof typeof TOUCH.buttons;
const S = TOUCH.sprint;
const BUTTON_IDS = Object.keys(TOUCH.buttons) as ButtonId[];

/** 브라우저 기본 제스처(스크롤·확대·길게 누르기 메뉴·당겨서 새로고침) 차단 */
export function lockBrowserGestures() {
  const stop = (e: Event) => e.preventDefault();
  addEventListener('touchmove', stop, { passive: false });
  addEventListener('contextmenu', stop);
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) addEventListener(ev, stop);
}

/**
 * 가상 조이스틱(왼쪽, 플로팅) + 시점 드래그 + 버튼. Pointer Events 로 pointerId 별 추적 → 멀티터치.
 *  - 조이스틱 손가락 1개, 시점 손가락 1개는 독립. 버튼은 각각 손가락 집합(Set)으로 추적해 어떤 순서로 떼도 상태가 맞다
 *  - 왼쪽 영역에 이미 조이스틱 손가락이 있으면 두 번째 손가락은 시점으로 쓴다(엄지가 영역을 넘어도 먹통이 되지 않게)
 *  - FIRE 를 누른 손가락을 끌면 시점이 돈다 (한 손으로 쏘면서 조준)
 *  - 전력질주 잠금: 조이스틱을 위로 길게 끌고 유지하면 잠긴다 (TOUCH.sprint)
 *  - 앱이 포커스를 잃으면(알림/홈 제스처) 모든 입력을 초기화해 고착을 막는다
 * 상태는 폴링: move*, look*(프레임마다 누적 후 endFrame 에서 0), fire/jump/interact.
 */
export class TouchControls {
  enabled = false;
  lookDX = 0;
  lookDY = 0;
  fireClicked = false;
  jumpPressed = false;
  interactPressed = false;
  swapPressed = false;
  /** 전력질주 잠금 상태 (손을 떼도 유지) */
  sprintLocked = false;

  private rawX = 0;
  private rawY = 0;
  private held = Object.fromEntries(BUTTON_IDS.map((id) => [id, new Set<number>()])) as Record<ButtonId, Set<number>>;
  private buttonEls = new Map<ButtonId, HTMLDivElement>();
  /** FIRE 를 누른 손가락별 마지막 위치 (끌어서 조준) */
  private aim = new Map<number, { x: number; y: number }>();

  private layer: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private lockHint: HTMLDivElement;
  private chip: HTMLDivElement;
  private movePtr = -1;
  private lookPtr = -1;
  private origin = { x: 0, y: 0 };
  private lastLook = { x: 0, y: 0 };
  /** 손가락이 잠금 위치에 머물기 시작한 시각 (0 = 해당 없음) */
  private rimSince = 0;

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:fixed;inset:0;z-index:10;touch-action:none;display:none';
    root.appendChild(this.layer);

    const J = TOUCH.joystick;
    this.base = this.circle(J.radius * 2, 'rgba(255,255,255,0.12)');
    this.knob = this.circle(J.knobSize, 'rgba(255,255,255,0.35)');
    this.lockHint = this.circle(44, 'rgba(127,191,106,0)');
    this.lockHint.textContent = '▲▲';
    this.lockHint.style.cssText += ';display:none;align-items:center;justify-content:center;color:#fff;font:bold 11px monospace';
    this.base.style.display = this.knob.style.display = 'none';
    this.layer.append(this.base, this.knob, this.lockHint);

    for (const id of BUTTON_IDS) this.makeButton(id);

    const C = S.chip;
    this.chip = document.createElement('div');
    this.chip.textContent = C.label;
    this.chip.style.cssText = `position:fixed;left:${C.left}px;bottom:${C.bottom}px;width:${C.width}px;height:${C.height}px;` +
      'border-radius:22px;background:rgba(127,191,106,0.55);border:2px solid rgba(127,191,106,0.95);color:#fff;' +
      'font:bold 13px monospace;display:none;align-items:center;justify-content:center;box-sizing:border-box;' +
      'touch-action:none;user-select:none';
    // 탭하면 잠금 해제 (조이스틱/시점 영역으로 전파 금지)
    this.chip.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.setSprintLock(false); });
    this.layer.appendChild(this.chip);

    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    this.layer.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e: PointerEvent) => this.onUp(e);
    this.layer.addEventListener('pointerup', up);
    this.layer.addEventListener('pointercancel', up);

    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });

    // 터치가 주 입력이면 즉시, 아니면 첫 터치가 들어올 때 활성화
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    else addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  get moveX() { return this.rawX; }
  /** 전력질주 잠금 + autoRun 이면 손을 떼도 전진 입력 1 */
  get moveY() { return this.sprintLocked && S.autoRun ? 1 : this.rawY; }
  get fireHeld() { return this.held.fire.size > 0; }

  private enable() {
    this.enabled = true;
    this.layer.style.display = 'block';
  }

  private circle(size: number, bg: string) {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;width:${size}px;height:${size}px;border-radius:50%;background:${bg};` +
      'border:2px solid rgba(255,255,255,0.35);pointer-events:none;box-sizing:border-box';
    return d;
  }

  private setButtonVisual(id: ButtonId, down: boolean) {
    const b = this.buttonEls.get(id);
    if (b) b.style.background = `rgba(255,255,255,${down ? 0.6 : TOUCH.buttonOpacity * 0.5})`;
  }

  private makeButton(id: ButtonId) {
    const c = TOUCH.buttons[id];
    const b = document.createElement('div');
    b.textContent = c.label;
    b.style.cssText = `position:fixed;right:${c.right}px;bottom:${c.bottom}px;width:${c.size}px;height:${c.size}px;` +
      `border-radius:50%;background:rgba(255,255,255,${TOUCH.buttonOpacity * 0.5});border:2px solid rgba(255,255,255,${TOUCH.buttonOpacity});` +
      `color:#fff;font:bold ${Math.round(c.size / 6)}px monospace;display:flex;align-items:center;justify-content:center;` +
      'box-sizing:border-box;touch-action:none;user-select:none';
    b.dataset.btn = id;
    this.buttonEls.set(id, b);

    const press = (e: PointerEvent) => {
      e.stopPropagation(); // 시점/조이스틱 영역으로 전파 금지
      b.setPointerCapture(e.pointerId);
      this.held[id].add(e.pointerId);
      this.setButtonVisual(id, true);
      if (id === 'fire') { this.fireClicked = true; this.aim.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
      else if (id === 'jump') this.jumpPressed = true;
      else if (id === 'swap') this.swapPressed = true;
      else this.interactPressed = true;
    };
    const release = (e: PointerEvent) => {
      e.stopPropagation();
      this.held[id].delete(e.pointerId);
      this.aim.delete(e.pointerId);
      if (this.held[id].size === 0) this.setButtonVisual(id, false);
    };
    const move = (e: PointerEvent) => {
      const a = this.aim.get(e.pointerId);
      if (!a) return;
      this.lookDX += (e.clientX - a.x) * TOUCH.lookSensitivity;
      this.lookDY += (e.clientY - a.y) * TOUCH.lookSensitivity;
      a.x = e.clientX;
      a.y = e.clientY;
    };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    this.layer.appendChild(b);
  }

  private place(el: HTMLElement, x: number, y: number) {
    const s = parseFloat(el.style.width);
    el.style.left = `${x - s / 2}px`;
    el.style.top = `${y - s / 2}px`;
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    this.layer.setPointerCapture(e.pointerId);
    const inMoveZone = e.clientX < innerWidth * TOUCH.moveZoneWidth;
    if (inMoveZone && this.movePtr === -1) {
      this.movePtr = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.place(this.base, e.clientX, e.clientY);
      this.place(this.knob, e.clientX, e.clientY);
      this.base.style.display = this.knob.style.display = 'block';
      this.base.style.borderColor = this.sprintLocked ? 'rgba(127,191,106,0.95)' : 'rgba(255,255,255,0.35)';
      if (!this.sprintLocked) {
        // 잠금 목표를 조이스틱 위쪽(engage 거리)에 표시
        this.place(this.lockHint, e.clientX, e.clientY - S.engage * TOUCH.joystick.radius);
        this.lockHint.style.background = 'rgba(127,191,106,0)';
        this.lockHint.style.display = 'flex';
      }
    } else if (this.lookPtr === -1) {
      // 오른쪽 영역, 또는 조이스틱 손가락이 이미 있는 왼쪽 영역의 두 번째 손가락
      this.lookPtr = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.movePtr) {
      const J = TOUCH.joystick;
      let dx = (e.clientX - this.origin.x) / J.radius;
      let dy = (e.clientY - this.origin.y) / J.radius;
      const mag = Math.hypot(dx, dy);

      // 위로 길게 끈 위치(정면 ±coneDeg, 거리 ≥ engage·반경)에 머무는 시간 측정 → endFrame 에서 잠금 판정
      const atRim = inSprintZone(dx, dy, S.engage, (S.coneDeg * Math.PI) / 180);
      if (atRim) { if (!this.rimSince) this.rimSince = performance.now(); } else this.rimSince = 0;

      if (mag > 1) { dx /= mag; dy /= mag; }
      const m = Math.min(mag, 1);
      const scale = m < J.deadzone ? 0 : (m - J.deadzone) / (1 - J.deadzone) / (m || 1);
      this.rawX = dx * scale;
      this.rawY = -dy * scale;
      this.place(this.knob, this.origin.x + dx * J.radius, this.origin.y + dy * J.radius);

      // 잠금 중 뒤로 당기면 해제
      if (this.sprintLocked && this.rawY < -S.cancelBackward) this.setSprintLock(false);
    } else if (e.pointerId === this.lookPtr) {
      this.lookDX += (e.clientX - this.lastLook.x) * TOUCH.lookSensitivity;
      this.lookDY += (e.clientY - this.lastLook.y) * TOUCH.lookSensitivity;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.movePtr) {
      this.movePtr = -1;
      this.rawX = this.rawY = 0;
      this.rimSince = 0;
      this.base.style.display = this.knob.style.display = this.lockHint.style.display = 'none';
    } else if (e.pointerId === this.lookPtr) {
      this.lookPtr = -1;
    }
  }

  private setSprintLock(on: boolean) {
    if (this.sprintLocked === on) return;
    this.sprintLocked = on;
    this.rimSince = 0;
    this.chip.style.display = on ? 'flex' : 'none';
    this.lockHint.style.display = 'none';
    this.base.style.borderColor = on ? 'rgba(127,191,106,0.95)' : 'rgba(255,255,255,0.35)';
    if (on) { try { navigator.vibrate?.(S.vibrateMs); } catch { /* 진동 미지원: 무시 */ } }
  }

  /** 포커스 상실/탭 전환: 눌린 채 남는 입력(발사, 이동, 잠금)을 전부 해제 */
  releaseAll() {
    this.movePtr = this.lookPtr = -1;
    this.rawX = this.rawY = 0;
    this.rimSince = 0;
    for (const id of BUTTON_IDS) { this.held[id].clear(); this.setButtonVisual(id, false); }
    this.aim.clear();
    this.base.style.display = this.knob.style.display = this.lockHint.style.display = 'none';
    this.setSprintLock(false);
  }

  endFrame() {
    this.lookDX = this.lookDY = 0;
    this.fireClicked = this.jumpPressed = this.interactPressed = this.swapPressed = false;

    // 유지 시간 → 잠금 (손가락이 가만히 있어도 프레임마다 판정)
    if (this.rimSince && !this.sprintLocked) {
      const p = (performance.now() - this.rimSince) / (S.holdSec * 1000);
      this.lockHint.style.background = `rgba(127,191,106,${Math.min(1, p) * 0.85})`;
      if (p >= 1) this.setSprintLock(true);
    }
  }
}
