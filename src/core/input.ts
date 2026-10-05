import { TouchControls, lockBrowserGestures } from './touch';

/** 플레이어 이동에 필요한 최소 입력. 레이드가 끝난 뒤에는 IDLE_INPUT 으로 조작을 막는다 */
export interface PlayerInput {
  readonly moveX: number;
  readonly moveY: number;
  readonly lookDX: number;
  readonly lookDY: number;
  readonly jumpPressed: boolean;
}
export const IDLE_INPUT: PlayerInput = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, jumpPressed: false };

/**
 * 통합 입력. 데스크톱(WASD + 마우스 PointerLock)과 터치를 합쳐 같은 폴링 API 로 제공한다.
 * 게임 코드는 키/터치를 직접 보지 말고 moveX/moveY, lookDX/DY, fire*, jumpPressed, interactPressed 만 쓴다.
 */
export class Input {
  readonly touch: TouchControls;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseButtons = new Set<number>();
  private mouseClicks = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;

  constructor(private el: HTMLElement, root: HTMLElement) {
    lockBrowserGestures();
    this.touch = new TouchControls(root);

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (!this.locked) { el.requestPointerLock(); return; }
      this.mouseButtons.add(e.button);
      this.mouseClicks.add(e.button);
    });
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.mouseButtons.delete(e.button); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  get locked() { return document.pointerLockElement === this.el; }
  /** 입력을 받을 수 있는 상태인가 (데스크톱: 포인터 잠금, 터치: 활성) */
  get active() { return this.locked || this.touch.enabled; }

  private key(code: string) { return this.keys.has(code) ? 1 : 0; }
  get moveX() { return clamp1(this.key('KeyD') - this.key('KeyA') + this.touch.moveX); }
  get moveY() { return clamp1(this.key('KeyW') - this.key('KeyS') + this.touch.moveY); }
  get lookDX() { return this.mouseDX + this.touch.lookDX; }
  get lookDY() { return this.mouseDY + this.touch.lookDY; }
  get fire() { return (this.locked && this.mouseButtons.has(0)) || this.touch.fireHeld; }
  get fireClicked() { return (this.locked && this.mouseClicks.has(0)) || this.touch.fireClicked; }
  get jumpPressed() { return this.pressed.has('Space') || this.touch.jumpPressed; }
  get swapPressed() { return this.pressed.has('KeyQ') || this.touch.swapPressed; }
  get interactPressed() { return this.pressed.has('KeyE') || this.touch.interactPressed; }
  /** 디버그/토글용 키 */
  justPressed(code: string) { return this.pressed.has(code); }

  /** 프레임 끝에 호출: 1프레임성 입력 초기화 */
  endFrame() {
    this.pressed.clear();
    this.mouseClicks.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touch.endFrame();
  }
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
