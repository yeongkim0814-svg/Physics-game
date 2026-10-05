/**
 * 탈출 진행도(초). 지점 안에서는 dt 만큼 오르고, 벗어나면 decay 배로 줄어든다(0 미만 없음).
 * 진행도가 hold 이상이면 done. hold=0 이면 지점에 들어간 즉시 성공.
 */
export function stepExtract(progress: number, inZone: boolean, dt: number, hold: number, decay: number): { progress: number; done: boolean } {
  if (inZone) {
    const p = Math.min(hold, progress + dt);
    return { progress: p, done: p >= hold };
  }
  return { progress: Math.max(0, progress - dt * decay), done: false };
}
