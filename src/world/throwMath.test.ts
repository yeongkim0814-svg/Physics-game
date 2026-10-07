import { describe, expect, it } from 'vitest';
import { cullReason, evictForRoom, freeFallTime, tickCooldown, throwVelocity } from './throwMath';

describe('throwVelocity', () => {
  it('방향을 정규화해 초속을 곱한다', () => {
    const v = throwVelocity({ x: 0, y: 0, z: -3 }, 14, { x: 0, y: 0, z: 0 }, 1);
    expect(v).toEqual({ x: 0, y: 0, z: -14 });
  });
  it('플레이어 속도를 승계 비율만큼 더한다', () => {
    const v = throwVelocity({ x: 1, y: 0, z: 0 }, 10, { x: 2, y: 4, z: 0 }, 0.5);
    expect(v).toEqual({ x: 11, y: 2, z: 0 });
  });
  it('승계 0 이면 플레이어 속도를 무시한다', () => {
    const v = throwVelocity({ x: 0, y: 1, z: 0 }, 5, { x: 9, y: 9, z: 9 }, 0);
    expect(v).toEqual({ x: 0, y: 5, z: 0 });
  });
});

describe('cullReason', () => {
  const rules = { maxAge: 30, voidY: -40, settledLife: 8 };
  it('정상 비행 중이면 유지', () => expect(cullReason({ age: 1, y: 5, landedFor: null }, rules)).toBeNull());
  it('맵 아래로 떨어지면 void', () => expect(cullReason({ age: 1, y: -41, landedFor: null }, rules)).toBe('void'));
  it('수명 초과면 age', () => expect(cullReason({ age: 30, y: 0, landedFor: null }, rules)).toBe('age'));
  it('착지 후 오래되면 settled', () => expect(cullReason({ age: 12, y: 0, landedFor: 8 }, rules)).toBe('settled'));
  it('착지 직후는 유지', () => expect(cullReason({ age: 12, y: 0, landedFor: 1 }, rules)).toBeNull());
});

describe('evictForRoom', () => {
  it('자리가 있으면 치우지 않는다', () => expect(evictForRoom([3, 2, 1], 4)).toEqual([]));
  it('가득 차면 가장 오래된 하나를 치운다', () => expect(evictForRoom([1, 9, 5], 3)).toEqual([1]));
  it('초과분이 여럿이면 오래된 순으로 여럿', () => expect(evictForRoom([1, 9, 5, 7], 2)).toEqual([1, 3, 2]));
});

describe('tickCooldown / freeFallTime', () => {
  it('쿨다운은 0 아래로 내려가지 않는다', () => {
    expect(tickCooldown(0.3, 0.1)).toBeCloseTo(0.2);
    expect(tickCooldown(0.05, 0.1)).toBe(0);
  });
  it('30m, g=20 이면 약 1.732s', () => expect(freeFallTime(30, 20)).toBeCloseTo(Math.sqrt(3), 6));
  it('높이 0 이하면 0', () => expect(freeFallTime(0, 20)).toBe(0));
});
