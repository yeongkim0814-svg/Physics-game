import { PERF } from '../config/settings';

const BTN = 'position:fixed;z-index:20;padding:6px 10px;font:bold 12px monospace;color:#fff;' +
  'background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.4);touch-action:manipulation;user-select:none';

/** 전체화면/FPS 토글 버튼, FPS 표시, 세로 화면 회전 안내 */
export function createOverlays(root: HTMLElement, isTouch: () => boolean) {
  const mk = (css: string, text: string) => {
    const d = document.createElement('div');
    d.style.cssText = css;
    d.textContent = text;
    root.appendChild(d);
    return d;
  };

  const fs = mk(`${BTN};top:8px;right:8px`, 'FULL');
  fs.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
      }
    } catch { /* 지원 안 함/거부: 무시 */ }
  });

  // 임시 무기 전환(장착 메뉴는 T9): URL 의 base 를 바꿔 다시 불러온다
  const wpn = mk(`${BTN};top:8px;right:136px`, 'WPN');
  wpn.addEventListener('click', () => {
    const u = new URL(location.href);
    const next = u.searchParams.get('base') === 'em_coil' ? 'momentum_launcher' : 'em_coil';
    for (const k of ['front', 'rear', 'top']) u.searchParams.delete(k);
    u.searchParams.set('base', next);
    location.href = u.toString();
  });

  let showFps: boolean = PERF.showFps;
  const fpsBtn = mk(`${BTN};top:8px;right:72px`, 'FPS');
  const fpsText = mk('position:fixed;z-index:20;top:44px;right:8px;font:12px monospace;color:#8f8;pointer-events:none', '');
  fpsBtn.addEventListener('click', () => { showFps = !showFps; fpsText.style.display = showFps ? 'block' : 'none'; });
  fpsText.style.display = showFps ? 'block' : 'none';

  const rotate = mk(
    'position:fixed;inset:0;z-index:30;background:#0a0d10;color:#ddd;font:20px monospace;display:none;' +
    'align-items:center;justify-content:center;text-align:center;white-space:pre',
    '↻\n화면을 가로로 돌려주세요',
  );

  return {
    setFps(fps: number, width: number) {
      if (showFps) fpsText.textContent = `${fps.toFixed(0)} fps  ${width}px`;
    },
    updateOrientation() {
      rotate.style.display = isTouch() && innerHeight > innerWidth ? 'flex' : 'none';
    },
    get fpsVisible() { return showFps; },
  };
}
