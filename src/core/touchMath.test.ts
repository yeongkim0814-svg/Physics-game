import { describe, expect, it } from 'vitest';
import { TOUCH } from '../config/settings';
import { hitCircle, inSprintIcon, stalePointerIds } from './touchMath';

describe('inSprintIcon', () => {
  it('아이콘 중심(시작점 바로 위 engage 거리)에 닿으면 true', () => {
    expect(inSprintIcon(0, -1.5, 1.5, 0.4)).toBe(true);
  });
  it('아이콘 반경 경계 안/밖', () => {
    expect(inSprintIcon(0.39, -1.5, 1.5, 0.4)).toBe(true);
    expect(inSprintIcon(0.41, -1.5, 1.5, 0.4)).toBe(false);
    expect(inSprintIcon(0, -1.5 + 0.41, 1.5, 0.4)).toBe(false);
  });
  it('평소 최대 전진(반경 1.0)은 아이콘 밖', () => {
    expect(inSprintIcon(0, -1, 1.5, 0.4)).toBe(false);
  });
  it('옆이나 아래로 끌면 아이콘 밖', () => {
    expect(inSprintIcon(1.5, 0, 1.5, 0.4)).toBe(false);
    expect(inSprintIcon(0, 1.5, 1.5, 0.4)).toBe(false);
  });
  it('좌우 대칭', () => {
    expect(inSprintIcon(-0.3, -1.5, 1.5, 0.4)).toBe(inSprintIcon(0.3, -1.5, 1.5, 0.4));
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
  it('조이스틱 림 끝까지 밀어도(반경 1.0) 전력질주 아이콘 판정에 닿지 않는다', () => {
    const { radius } = TOUCH.joystick;
    const S = TOUCH.sprint;
    const iconR = (S.iconSize / 2 + S.triggerSlop) / radius;
    for (let deg = -90; deg <= 90; deg += 10) {
      const a = (deg * Math.PI) / 180;
      expect(inSprintIcon(Math.sin(a), -Math.cos(a), S.iconDistance, iconR)).toBe(false);
    }
  });
  it('아이콘 중심까지 끌면 잠긴다', () => {
    const { radius } = TOUCH.joystick;
    const S = TOUCH.sprint;
    expect(inSprintIcon(0, -S.iconDistance, S.iconDistance, (S.iconSize / 2 + S.triggerSlop) / radius)).toBe(true);
  });
});
