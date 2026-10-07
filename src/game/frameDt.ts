/**
 * 프레임 시간(초). rAF 타임스탬프는 프레임 시작 시각이라 초기화 직후 첫 프레임에서 last 보다 앞설 수 있다(음수 dt).
 * 음수 dt 는 시간을 거꾸로 돌려 속도·위치를 튀게 하므로 0 이상으로 자르고, 탭 전환 등 긴 정지는 maxDt 로 자른다.
 */
export function frameDt(now: number, last: number, maxDt: number): number {
  return Math.min(Math.max((now - last) / 1000, 0), maxDt);
}
