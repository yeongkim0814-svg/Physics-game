/**
 * 탭 처리. 브라우저는 다른 손가락이 이미 화면에 닿아 있으면(예: 조이스틱을 잡은 채) 두 번째 손가락의 탭에 click 을 만들지 않는다.
 * 그래서 pointerdown 이 이 요소에서 시작된 같은 손가락의 pointerup 으로 직접 판정한다.
 * click 은 키보드(Enter/Space)·프로그램 호출(detail 0)일 때만 받는다 (마우스/터치 탭은 pointer 로 이미 처리됨).
 */
export function onTap(el: HTMLElement, fn: () => void) {
  const down = new Set<number>();
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => { down.add(e.pointerId); e.stopPropagation(); });
  el.addEventListener('pointerup', (e) => { if (down.delete(e.pointerId)) fn(); });
  el.addEventListener('pointercancel', (e) => { down.delete(e.pointerId); });
  el.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
}
