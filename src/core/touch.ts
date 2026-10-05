import { TOUCH } from '../config/settings';

type ButtonId = keyof typeof TOUCH.buttons;

/** 브라우저 기본 제스처(스크롤·확대·길게 누르기 메뉴·당겨서 새로고침) 차단 */
export function lockBrowserGestures() {
  const stop = (e: Event) => e.preventDefault();
  addEventListener('touchmove', stop, { passive: false });
  addEventListener('contextmenu', stop);
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) addEventListener(ev, stop);
}

/**
 * 가상 조이스틱(왼쪽, 플로팅) + 시점 드래그(오른쪽) + 버튼. Pointer Events 로 pointerId 별 추적 → 멀티터치.
 * 상태는 폴링: move*, look*(프레임마다 누적 후 endFrame 에서 0), fire/jump/interact.
 */
export class TouchControls {
  enabled = false;
  moveX = 0;
  moveY = 0;
  lookDX = 0;
  lookDY = 0;
  fireHeld = false;
  fireClicked = false;
  jumpPressed = false;
  interactPressed = false;

  private layer: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private movePtr = -1;
  private lookPtr = -1;
  private origin = { x: 0, y: 0 };
  private lastLook = { x: 0, y: 0 };

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:fixed;inset:0;z-index:10;touch-action:none;display:none';
    root.appendChild(this.layer);

    const J = TOUCH.joystick;
    this.base = this.circle(J.radius * 2, 'rgba(255,255,255,0.12)');
    this.knob = this.circle(J.knobSize, 'rgba(255,255,255,0.35)');
    this.base.style.display = this.knob.style.display = 'none';
    this.layer.append(this.base, this.knob);

    for (const id of Object.keys(TOUCH.buttons) as ButtonId[]) this.makeButton(id);

    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    this.layer.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e: PointerEvent) => this.onUp(e);
    this.layer.addEventListener('pointerup', up);
    this.layer.addEventListener('pointercancel', up);

    // 터치가 주 입력이면 즉시, 아니면 첫 터치가 들어올 때 활성화
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    else addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

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

  private makeButton(id: ButtonId) {
    const c = TOUCH.buttons[id];
    const b = document.createElement('div');
    b.textContent = c.label;
    b.style.cssText = `position:fixed;right:${c.right}px;bottom:${c.bottom}px;width:${c.size}px;height:${c.size}px;` +
      `border-radius:50%;background:rgba(255,255,255,${TOUCH.buttonOpacity * 0.5});border:2px solid rgba(255,255,255,${TOUCH.buttonOpacity});` +
      `color:#fff;font:bold ${Math.round(c.size / 6)}px monospace;display:flex;align-items:center;justify-content:center;` +
      'box-sizing:border-box;touch-action:none;user-select:none';
    b.dataset.btn = id;
    const press = (e: PointerEvent) => {
      e.stopPropagation(); // 시점/조이스틱 영역으로 전파 금지
      b.setPointerCapture(e.pointerId);
      b.style.background = 'rgba(255,255,255,0.6)';
      if (id === 'fire') { this.fireHeld = true; this.fireClicked = true; }
      else if (id === 'jump') this.jumpPressed = true;
      else this.interactPressed = true;
    };
    const release = (e: PointerEvent) => {
      e.stopPropagation();
      b.style.background = `rgba(255,255,255,${TOUCH.buttonOpacity * 0.5})`;
      if (id === 'fire') this.fireHeld = false;
    };
    b.addEventListener('pointerdown', press);
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
    if (e.clientX < innerWidth * TOUCH.moveZoneWidth) {
      if (this.movePtr !== -1) return;
      this.movePtr = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.place(this.base, e.clientX, e.clientY);
      this.place(this.knob, e.clientX, e.clientY);
      this.base.style.display = this.knob.style.display = 'block';
    } else if (this.lookPtr === -1) {
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
      if (mag > 1) { dx /= mag; dy /= mag; }
      const m = Math.min(mag, 1);
      const scale = m < J.deadzone ? 0 : (m - J.deadzone) / (1 - J.deadzone) / (m || 1);
      this.moveX = dx * scale;
      this.moveY = -dy * scale;
      this.place(this.knob, this.origin.x + dx * J.radius, this.origin.y + dy * J.radius);
    } else if (e.pointerId === this.lookPtr) {
      this.lookDX += (e.clientX - this.lastLook.x) * TOUCH.lookSensitivity;
      this.lookDY += (e.clientY - this.lastLook.y) * TOUCH.lookSensitivity;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.movePtr) {
      this.movePtr = -1;
      this.moveX = this.moveY = 0;
      this.base.style.display = this.knob.style.display = 'none';
    } else if (e.pointerId === this.lookPtr) {
      this.lookPtr = -1;
    }
  }

  endFrame() {
    this.lookDX = this.lookDY = 0;
    this.fireClicked = this.jumpPressed = this.interactPressed = false;
  }
}
