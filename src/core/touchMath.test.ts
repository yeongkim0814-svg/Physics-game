import { describe, expect, it } from 'vitest';
import { inSprintZone } from './touchMath';

const CONE = (35 * Math.PI) / 180;

describe('inSprintZone', () => {
  it('정면으로 engage 이상 끌면 영역 안', () => {
    expect(inSprintZone(0, -1.5, 1.5, CONE)).toBe(true);
    expect(inSprintZone(0, -2.5, 1.5, CONE)).toBe(true);
  });
  it('평소 최대 전진(반경 1.0)은 engage(1.5) 미만이라 영역 밖', () => {
    expect(inSprintZone(0, -1, 1.5, CONE)).toBe(false);
  });
  it('콘 각도 안쪽/바깥쪽 경계', () => {
    const r = 2;
    expect(inSprintZone(r * Math.sin(CONE - 0.02), -r * Math.cos(CONE - 0.02), 1.5, CONE)).toBe(true);
    expect(inSprintZone(r * Math.sin(CONE + 0.02), -r * Math.cos(CONE + 0.02), 1.5, CONE)).toBe(false);
  });
  it('옆이나 아래로 길게 끌어도 영역 밖', () => {
    expect(inSprintZone(2, 0, 1.5, CONE)).toBe(false);
    expect(inSprintZone(0, 2, 1.5, CONE)).toBe(false);
  });
  it('좌우 대칭', () => {
    expect(inSprintZone(-0.5, -1.6, 1.5, CONE)).toBe(inSprintZone(0.5, -1.6, 1.5, CONE));
  });
});
