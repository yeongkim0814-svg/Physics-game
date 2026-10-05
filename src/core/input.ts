/** 키보드/마우스/PointerLock 입력 상태. 폴링 방식. */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private buttons = new Set<number>();
  private clicked = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) { el.requestPointerLock(); return; }
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  get locked() { return document.pointerLockElement === this.el; }
  down(code: string) { return this.keys.has(code); }
  justPressed(code: string) { return this.pressed.has(code); }
  mouseDown(b = 0) { return this.locked && this.buttons.has(b); }
  mouseClicked(b = 0) { return this.clicked.has(b); }

  /** 프레임 끝에 호출: 1프레임성 입력 초기화 */
  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
