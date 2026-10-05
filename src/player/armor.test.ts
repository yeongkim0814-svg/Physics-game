import { describe, expect, it } from 'vitest';
import { createItem } from '../hub/gear';
import { armorSpeedMul, resolveArmorHit } from './armor';

describe('방어구', () => {
  it('저항 종류별로 피해를 줄인다 (충격 vs 전기)', () => {
    const plate = createItem('plate_vest'); // 충격 35%, 전기 0
    expect(resolveArmorHit([plate], 100, 'physical')).toBeCloseTo(65);
    expect(resolveArmorHit([plate], 100, 'electric')).toBeCloseTo(100);
    const rubber = createItem('rubber_suit'); // 전기 45%
    expect(resolveArmorHit([rubber], 100, 'leak')).toBeCloseTo(55); // 누전도 전기 저항
    expect(resolveArmorHit([rubber], 100, 'fall')).toBeCloseTo(95); // 낙하는 충격 저항
  });

  it('몸통+보조는 곱연산', () => {
    const v = createItem('plate_vest'), g = createItem('shin_guard');
    expect(resolveArmorHit([v, g], 100, 'physical')).toBeCloseTo(100 * 0.65 * 0.9);
  });

  it('저항이 있는 조각만 마모되고, 내구도 0 이면 효과가 정지한다', () => {
    const plate = createItem('plate_vest');
    const before = plate.dur!;
    resolveArmorHit([plate], 10, 'electric'); // 전기 저항 0 → 마모 없음
    expect(plate.dur).toBe(before);
    resolveArmorHit([plate], 10, 'physical');
    expect(plate.dur).toBeLessThan(before);
    plate.dur = 0;
    expect(resolveArmorHit([plate], 100, 'physical')).toBe(100);
    expect(armorSpeedMul([plate])).toBe(1); // 파손 → 이동 페널티도 정지
  });

  it('이동속도 페널티: 중장갑은 느려지고 하한이 있다', () => {
    expect(armorSpeedMul([])).toBe(1);
    expect(armorSpeedMul([createItem('plate_vest')])).toBeCloseTo(0.85);
    expect(armorSpeedMul([createItem('plate_vest'), createItem('shin_guard')])).toBeCloseTo(0.85 * 0.97);
    const heavy = createItem('plate_vest');
    heavy.lv = { armor_plating: 3 };
    expect(armorSpeedMul([heavy])).toBeLessThan(0.85);
  });

  it('알 수 없는 피해 종류는 그대로', () => {
    expect(resolveArmorHit([createItem('plate_vest')], 50, 'unknown' as never)).toBe(50);
  });
});
