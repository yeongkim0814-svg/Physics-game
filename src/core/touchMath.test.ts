import { describe, expect, it } from 'vitest';
import { TOUCH } from '../config/settings';
import { SPRINT_IDLE, autoSprintOnRelease, hitCircle, stalePointerIds, stepSprint, type SprintCfg, type SprintState } from './touchMath';

const CFG: SprintCfg = { start: 0.85, auto: 1.35, hysteresis: 0.05 };
/** y 값을 순서대로 넣어 최종 상태를 얻는다 */
const run = (ys: number[], from: SprintState = SPRINT_IDLE) => ys.reduce((st, y) => stepSprint(st, y, CFG), from);

describe('stepSprint (조이스틱 y 로 전력질주)', () => {
  it('start 미만이면 걷기(전력질주 아님)', () => {
    expect(run([0.2, 0.5, 0.84])).toEqual({ sprinting: false, armed: false });
  });
  it('y 가 start 이상이 되는 순간 전력질주', () => {
    expect(run([0.5, 0.85])).toEqual({ sprinting: true, armed: false });
    expect(run([1.0])).toEqual({ sprinting: true, armed: false });
  });
  it('auto 이상까지 올리면 자동 전력질주 대기(armed)', () => {
    expect(run([0.9, 1.2, 1.36])).toEqual({ sprinting: true, armed: true });
  });
  it('손을 떼지 않고 start 아래로 내리면 전력질주도 대기도 해제', () => {
    expect(run([0.9, 1.4, 0.5])).toEqual({ sprinting: false, armed: false });
    expect(run([0.9, 0.3])).toEqual({ sprinting: false, armed: false });
  });
  it('내렸다가 다시 올려도 대기는 처음부터 (이전 도달 기록이 남지 않음)', () => {
    expect(run([1.4, 0.5, 0.9])).toEqual({ sprinting: true, armed: false });
  });
  it('armed 후 start 와 auto 사이로 살짝 내려가도(손 뗄 때 흔들림) 유지', () => {
    expect(run([1.4, 1.1, 0.95])).toEqual({ sprinting: true, armed: true });
  });
  it('경계 떨림 방지: 전력질주 중에는 start-hysteresis 아래로 내려가야 해제', () => {
    expect(run([0.9, 0.82]).sprinting).toBe(true);
    expect(run([0.9, 0.79]).sprinting).toBe(false);
    expect(run([0.8]).sprinting).toBe(false); // 시작할 때는 hysteresis 없이 start 필요
  });
  it('입력 상태를 변경하지 않는다', () => {
    const s: SprintState = { sprinting: true, armed: false };
    stepSprint(s, 1.4, CFG);
    expect(s).toEqual({ sprinting: true, armed: false });
  });
});

describe('autoSprintOnRelease', () => {
  it('armed 상태로 손을 떼면 자동 전력질주', () => {
    expect(autoSprintOnRelease(run([0.9, 1.4]))).toBe(true);
  });
  it('전력질주만 하다 떼면 자동 아님', () => {
    expect(autoSprintOnRelease(run([0.9, 1.1]))).toBe(false);
  });
  it('걷다가 떼거나, auto 까지 갔다가 start 아래로 내린 뒤 떼면 자동 아님', () => {
    expect(autoSprintOnRelease(run([0.5]))).toBe(false);
    expect(autoSprintOnRelease(run([1.4, 0.4]))).toBe(false);
  });
});

describe('stalePointerIds', () => {
  const tracked = (o: Record<number, [number, number]>) => new Map(Object.entries(o).map(([k, [x, y]]) => [Number(k), { x, y }]));
  it('모든 추적 포인터에 짝이 있으면 비어 있음', () => {
    expect(stalePointerIds(tracked({ 1: [100, 100], 2: [500, 300] }), [{ x: 102, y: 99 }, { x: 498, y: 305 }], 40)).toEqual([]);
  });
  it('손가락이 모두 떨어졌으면(live 비어 있음) 전부 stale', () => {
    expect(stalePointerIds(tracked({ 1: [100, 100], 2: [500, 300] }), [], 40).sort()).toEqual([1, 2]);
  });
  it('놓친 pointerup: 남은 손가락과 가까운 쪽만 살리고 나머지가 stale', () => {
    expect(stalePointerIds(tracked({ 1: [100, 100], 2: [500, 300] }), [{ x: 505, y: 298 }], 40)).toEqual([1]);
  });
  it('한 손가락에 두 추적이 몰려도 1:1 짝만 인정', () => {
    expect(stalePointerIds(tracked({ 1: [100, 100], 2: [105, 102] }), [{ x: 101, y: 100 }], 40)).toEqual([2]);
  });
  it('허용 거리를 넘으면 짝이 아님', () => {
    expect(stalePointerIds(tracked({ 1: [100, 100] }), [{ x: 300, y: 100 }], 40)).toEqual([1]);
  });
});

describe('hitCircle', () => {
  const cs = [{ key: 'a' as const, cx: 100, cy: 100, r: 30 }, { key: 'b' as const, cx: 160, cy: 100, r: 30 }];
  it('원 안은 적중, 밖은 null', () => {
    expect(hitCircle(110, 100, cs, 0)).toBe('a');
    expect(hitCircle(300, 300, cs, 0)).toBeNull();
  });
  it('여유(slop) 안이면 적중', () => {
    expect(hitCircle(100, 136, cs, 0)).toBeNull();
    expect(hitCircle(100, 136, cs, 8)).toBe('a');
  });
  it('겹치면 중심이 더 가까운 버튼', () => {
    expect(hitCircle(135, 100, cs, 10)).toBe('b');
    expect(hitCircle(125, 100, cs, 10)).toBe('a');
  });
});

describe('TOUCH 설정 불변식', () => {
  const S = TOUCH.sprint;
  it('전력질주 시작은 조이스틱 데드존보다 크고 림(1.0) 이내라 림 끝까지만 밀어도 닿는다', () => {
    expect(S.start - S.hysteresis).toBeGreaterThan(TOUCH.joystick.deadzone);
    expect(S.start).toBeLessThanOrEqual(1);
  });
  it('자동 전력질주 값은 시작 값보다 크다 (림 밖까지 끌어야 한다)', () => {
    expect(S.auto).toBeGreaterThan(S.start);
    expect(S.auto).toBeGreaterThan(1);
  });
  it('시작 값을 지나친 뒤에만 자동 대기에 들어간다 (자동 값에서 시작 판정이 자연히 포함됨)', () => {
    expect(stepSprint(SPRINT_IDLE, S.auto, S)).toEqual({ sprinting: true, armed: true });
  });
});
