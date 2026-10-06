import { describe, expect, it } from 'vitest';
import {
  stairBlocks,
  lineNodes,
  gridNodes,
  inRect,
} from './mapGen';

describe('mapGen', () => {
  describe('stairBlocks baseY/floorY', () => {
    it('baseY 로 이어지는 계단의 윗면 높이가 오프셋된다', () => {
      const b = stairBlocks({ start: [0, 0], dir: '+x', steps: 2, width: 2, stepH: 0.5, stepD: 1, baseY: 8 });
      expect(b[0].pos[1] + b[0].size[1] / 2).toBeCloseTo(8.5);
      expect(b[1].pos[1] + b[1].size[1] / 2).toBeCloseTo(9);
      expect(b[0].pos[1] - b[0].size[1] / 2).toBeCloseTo(0); // 바닥 0 에서 채움
    });
    it('floorY 가 있으면 그 높이부터 채운다 (협곡 바닥)', () => {
      const b = stairBlocks({ start: [0, 0], dir: '+x', steps: 3, width: 2, stepH: 0.4, stepD: 1, baseY: -14, floorY: -14 });
      expect(b[0].pos[1] - b[0].size[1] / 2).toBeCloseTo(-14);
      expect(b[2].pos[1] + b[2].size[1] / 2).toBeCloseTo(-12.8);
    });
  });

  describe('stairBlocks', () => {
    it('기본 계단: steps=4, stepH=0.5, stepD=1, dir="-z", start=[0,10], width=2', () => {
      const boxes = stairBlocks({
        start: [0, 10],
        dir: '-z',
        steps: 4,
        width: 2,
        stepH: 0.5,
        stepD: 1,
      });

      expect(boxes).toHaveLength(4);

      // i=0: height=0.5, center_y=0.25, z_center=10
      expect(boxes[0].pos).toEqual([0, 0.25, 10]);
      expect(boxes[0].size).toEqual([2, 0.5, 1]);

      // i=1: height=1.0, center_y=0.5, z_center=9
      expect(boxes[1].pos).toEqual([0, 0.5, 9]);
      expect(boxes[1].size).toEqual([2, 1.0, 1]);

      // i=3: height=2.0, center_y=1.0, z_center=7 (마지막 계단 윗면 높이 = 4*0.5 = 2.0)
      expect(boxes[3].pos).toEqual([0, 1.0, 7]);
      expect(boxes[3].size).toEqual([2, 2.0, 1]);
    });

    it('방향 +x: 축이 x로 변경, size=[stepD, h, width]', () => {
      const boxes = stairBlocks({
        start: [0, 5],
        dir: '+x',
        steps: 2,
        width: 3,
        stepH: 0.8,
        stepD: 1,
      });

      expect(boxes).toHaveLength(2);

      // alongX=true, start[0]=0, along = 0 + 1*0*1 = 0
      expect(boxes[0].pos).toEqual([0, 0.4, 5]);
      expect(boxes[0].size).toEqual([1, 0.8, 3]); // [stepD, h, width]

      // i=1, along = 0 + 1*1*1 = 1
      expect(boxes[1].pos).toEqual([1, 0.8, 5]);
      expect(boxes[1].size).toEqual([1, 1.6, 3]);
    });

    it('단일 계단', () => {
      const boxes = stairBlocks({
        start: [10, 20],
        dir: '+z',
        steps: 1,
        width: 2,
        stepH: 1.0,
        stepD: 0.5,
      });

      expect(boxes).toHaveLength(1);
      expect(boxes[0].size[1]).toBe(1.0); // height = (0+1)*1.0
      expect(boxes[0].pos[1]).toBe(0.5); // center_y = 1.0/2
    });

    it('방향 -x: 인접 박스는 중심 간격 = stepD', () => {
      const boxes = stairBlocks({
        start: [100, 50],
        dir: '-x',
        steps: 3,
        width: 1,
        stepH: 0.5,
        stepD: 2.0,
      });

      expect(boxes).toHaveLength(3);
      // along values: 100, 100-2, 100-4 = 100, 98, 96
      expect(boxes[0].pos[0]).toBe(100);
      expect(boxes[1].pos[0]).toBe(98);
      expect(boxes[2].pos[0]).toBe(96);
    });
  });

  describe('lineNodes', () => {
    it('긴 박스 x축: size=[16,1,1], spacing=4 → 4개 노드', () => {
      const nodes = lineNodes([0, 0, 0], [16, 1, 1], 4);

      expect(nodes).toHaveLength(4);

      // 모든 노드 y=0, z=0 (center를 따름)
      nodes.forEach(n => {
        expect(n[1]).toBe(0);
        expect(n[2]).toBe(0);
      });

      // x 범위: center±8
      nodes.forEach(n => {
        expect(n[0]).toBeGreaterThanOrEqual(-8);
        expect(n[0]).toBeLessThanOrEqual(8);
      });

      // 인접 노드 간격 ≤ 4
      for (let i = 0; i < nodes.length - 1; i++) {
        const dist = Math.abs(nodes[i + 1][0] - nodes[i][0]);
        expect(dist).toBeLessThanOrEqual(4.1); // 부동소수점 공차
      }
    });

    it('짧은 박스 [1,1,1]: spacing=4 → 정확히 1개 노드 (중심)', () => {
      const nodes = lineNodes([5, 3, 7], [1, 1, 1], 4);

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual([5, 3, 7]);
    });

    it('z축이 더 긴 박스: size=[2,1,12], spacing=3 → z 방향 배치', () => {
      const nodes = lineNodes([0, 0, 0], [2, 1, 12], 3);

      expect(nodes.length).toBeGreaterThan(1);

      // 모든 노드 x=0, y=0 (center)
      nodes.forEach(n => {
        expect(n[0]).toBe(0);
        expect(n[1]).toBe(0);
      });

      // z 범위: center±6
      nodes.forEach(n => {
        expect(n[2]).toBeGreaterThanOrEqual(-6);
        expect(n[2]).toBeLessThanOrEqual(6);
      });
    });

    it('spacing보다 박스가 짧으면 1개', () => {
      const nodes = lineNodes([10, 10, 10], [2, 1, 2], 10);

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual([10, 10, 10]);
    });
  });

  describe('gridNodes', () => {
    it('기본: center=[0,0], size=[10,6], spacing=4, y=0.1 → nx=3, nz=2, 6개', () => {
      const nodes = gridNodes([0, 0], [10, 6], 4, 0.1);

      expect(nodes).toHaveLength(6);

      // 모든 노드 y=0.1
      nodes.forEach(n => {
        expect(n[1]).toBe(0.1);
      });

      // 모든 노드가 영역 안: x ∈ [-5,5], z ∈ [-3,3]
      nodes.forEach(n => {
        expect(n[0]).toBeGreaterThanOrEqual(-5);
        expect(n[0]).toBeLessThanOrEqual(5);
        expect(n[2]).toBeGreaterThanOrEqual(-3);
        expect(n[2]).toBeLessThanOrEqual(3);
      });

      // 격자 셀 크기 ≤ spacing
      // nx=3이므로 x 간격: 10/3 ≈ 3.33
      // nz=2이므로 z 간격: 6/2 = 3
      const cellWidth = 10 / 3;
      const cellDepth = 6 / 2;
      expect(cellWidth).toBeLessThanOrEqual(4.1);
      expect(cellDepth).toBeLessThanOrEqual(4.1);
    });

    it('spacing이 size보다 크면 1개 (중심)', () => {
      const nodes = gridNodes([5, 10], [6, 4], 20, 2.5);

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual([5, 2.5, 10]);
    });

    it('중심이 원점이 아닌 사각형: center=[10,20], size=[8,10], spacing=3, y=1.0', () => {
      const nodes = gridNodes([10, 20], [8, 10], 3, 1.0);

      // 모든 노드 y=1.0
      nodes.forEach(n => {
        expect(n[1]).toBe(1.0);
      });

      // 모든 노드가 영역 안: x ∈ [6,14], z ∈ [15,25]
      nodes.forEach(n => {
        expect(n[0]).toBeGreaterThanOrEqual(6);
        expect(n[0]).toBeLessThanOrEqual(14);
        expect(n[2]).toBeGreaterThanOrEqual(15);
        expect(n[2]).toBeLessThanOrEqual(25);
      });

      // 최소 4개 노드 (ceil(8/3) * ceil(10/3) = 3 * 4 = 12)
      expect(nodes.length).toBeGreaterThanOrEqual(4);
    });

    it('정확히 1행 1열: size=[2,3], spacing=10, y=0', () => {
      const nodes = gridNodes([0, 0], [2, 3], 10, 0);

      expect(nodes).toHaveLength(1);
      expect(nodes[0][1]).toBe(0);
      expect(nodes[0][0]).toBe(0);
      expect(nodes[0][2]).toBe(0);
    });
  });

  describe('inRect', () => {
    it('점이 사각형 내부', () => {
      expect(inRect(0, 0, [0, 0], [10, 10])).toBe(true);
      expect(inRect(2, 3, [0, 0], [10, 10])).toBe(true);
      expect(inRect(-4, -4, [0, 0], [10, 10])).toBe(true);
    });

    it('점이 경계 위', () => {
      // x 경계: center±size/2
      expect(inRect(5, 0, [0, 0], [10, 10])).toBe(true);  // x=5 (0+10/2)
      expect(inRect(-5, 0, [0, 0], [10, 10])).toBe(true); // x=-5 (0-10/2)
      expect(inRect(0, 5, [0, 0], [10, 10])).toBe(true);  // z=5 (0+10/2)
      expect(inRect(0, -5, [0, 0], [10, 10])).toBe(true); // z=-5 (0-10/2)
    });

    it('점이 사각형 외부', () => {
      expect(inRect(6, 0, [0, 0], [10, 10])).toBe(false);
      expect(inRect(0, 6, [0, 0], [10, 10])).toBe(false);
      expect(inRect(10, 10, [0, 0], [10, 10])).toBe(false);
    });

    it('중심이 원점이 아닌 사각형', () => {
      const center: [number, number] = [10, 20];
      const size: [number, number] = [8, 6];
      // x ∈ [6, 14], z ∈ [17, 23]

      expect(inRect(10, 20, center, size)).toBe(true);   // 중심
      expect(inRect(6, 17, center, size)).toBe(true);    // 경계
      expect(inRect(14, 23, center, size)).toBe(true);   // 경계
      expect(inRect(13, 21, center, size)).toBe(true);   // 내부
      expect(inRect(5, 20, center, size)).toBe(false);   // x < 6
      expect(inRect(15, 20, center, size)).toBe(false);  // x > 14
      expect(inRect(10, 16, center, size)).toBe(false);  // z < 17
      expect(inRect(10, 24, center, size)).toBe(false);  // z > 23
    });

    it('0 크기 사각형: center=[5,5], size=[0,0]', () => {
      // 오직 중심 점만 포함
      expect(inRect(5, 5, [5, 5], [0, 0])).toBe(true);
      expect(inRect(5, 5.001, [5, 5], [0, 0])).toBe(false);
      expect(inRect(5.001, 5, [5, 5], [0, 0])).toBe(false);
    });
  });
});
