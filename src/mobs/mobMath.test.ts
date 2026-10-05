import { describe, expect, it } from 'vitest';
import {
  stepAttack,
  chaseDir,
  separation,
  rollDrop,
  turnToward,
  READY,
} from './mobMath';

describe('mobMath', () => {
  describe('stepAttack', () => {
    const windup = 0.35;
    const cooldown = 1.0;

    it('ready에서 사거리 밖이면 상태 유지, hit=false', () => {
      const result = stepAttack(READY, 0.1, false, windup, cooldown);
      expect(result.state).toBe(READY);
      expect(result.hit).toBe(false);
    });

    it('ready에서 사거리 안이면 windup 진입, t=windup, hit=false', () => {
      const result = stepAttack(READY, 0.1, true, windup, cooldown);
      expect(result.state.phase).toBe('windup');
      expect(result.state.t).toBe(windup);
      expect(result.hit).toBe(false);
    });

    it('windup 중 dt 누적으로 t 감소', () => {
      const windupState = { phase: 'windup' as const, t: windup };
      const result1 = stepAttack(windupState, 0.1, true, windup, cooldown);
      expect(result1.state.phase).toBe('windup');
      expect(result1.state.t).toBeCloseTo(windup - 0.1);

      const result2 = stepAttack(result1.state, 0.15, true, windup, cooldown);
      expect(result2.state.phase).toBe('windup');
      expect(result2.state.t).toBeCloseTo(windup - 0.1 - 0.15);
    });

    it('windup 끝났을 때 inReach=true면 hit=true, recover 로 전이', () => {
      // windup이 0.35이므로, 0.35 이상 dt를 주면 t가 0 이하가 됨
      const windupState = { phase: 'windup' as const, t: 0.2 };
      const result = stepAttack(windupState, 0.3, true, windup, cooldown);
      expect(result.state.phase).toBe('recover');
      expect(result.state.t).toBe(cooldown);
      expect(result.hit).toBe(true);
    });

    it('windup 끝났을 때 inReach=false면 hit=false (헛스윙), recover 로 전이', () => {
      const windupState = { phase: 'windup' as const, t: 0.2 };
      const result = stepAttack(windupState, 0.3, false, windup, cooldown);
      expect(result.state.phase).toBe('recover');
      expect(result.state.t).toBe(cooldown);
      expect(result.hit).toBe(false);
    });

    it('recover 단계에서 dt 누적 후 ready로 복귀, hit=false', () => {
      const recoverState = { phase: 'recover' as const, t: cooldown };
      const result1 = stepAttack(recoverState, 0.5, true, windup, cooldown);
      expect(result1.state.phase).toBe('recover');
      expect(result1.state.t).toBeCloseTo(cooldown - 0.5);

      const result2 = stepAttack(result1.state, 0.6, true, windup, cooldown);
      expect(result2.state.phase).toBe('ready');
      expect(result2.hit).toBe(false);
    });

    it('한 사이클 전체 (ready→windup→hit→recover→ready)', () => {
      // ready 상태에서 시작
      let state = READY;
      let result = stepAttack(state, 0, true, windup, cooldown);
      expect(result.state.phase).toBe('windup');
      state = result.state;

      // windup 진행 (총 0.35초 필요)
      result = stepAttack(state, 0.2, true, windup, cooldown);
      expect(result.state.phase).toBe('windup');
      state = result.state;

      // windup 종료, hit 발생
      result = stepAttack(state, 0.2, true, windup, cooldown);
      expect(result.state.phase).toBe('recover');
      expect(result.hit).toBe(true);
      state = result.state;

      // recover 진행 (총 1.0초 필요)
      result = stepAttack(state, 0.6, true, windup, cooldown);
      expect(result.state.phase).toBe('recover');
      state = result.state;

      // recover 종료, ready 복귀
      result = stepAttack(state, 0.5, true, windup, cooldown);
      expect(result.state.phase).toBe('ready');
      expect(result.hit).toBe(false);
    });
  });

  describe('chaseDir', () => {
    it('기본 방향 벡터 (dx=3, dz=4) → [0.6, 0.8] (거리 5)', () => {
      const [dx, dz] = chaseDir(0, 0, 3, 4);
      expect(dx).toBeCloseTo(0.6);
      expect(dz).toBeCloseTo(0.8);
    });

    it('대각선 방향 (1,1) → [1/√2, 1/√2]', () => {
      const [dx, dz] = chaseDir(0, 0, 1, 1);
      const sqrt2inv = 1 / Math.sqrt(2);
      expect(dx).toBeCloseTo(sqrt2inv);
      expect(dz).toBeCloseTo(sqrt2inv);
    });

    it('같은 위치면 [0, 0]', () => {
      const result = chaseDir(5, 5, 5, 5);
      expect(result).toEqual([0, 0]);
    });

    it('음수 좌표도 정확한 방향 제공', () => {
      const [dx, dz] = chaseDir(-1, -1, 2, 3);
      const distance = Math.hypot(3, 4); // 5
      expect(dx).toBeCloseTo(3 / distance);
      expect(dz).toBeCloseTo(4 / distance);
    });
  });

  describe('separation', () => {
    it('이웃 없음 → [0, 0]', () => {
      const result = separation(0, 0, [], 2);
      expect(result).toEqual([0, 0]);
    });

    it('minDist 밖의 이웃은 영향 없음', () => {
      const result = separation(0, 0, [[5, 0]], 2);
      expect(result).toEqual([0, 0]);
    });

    it('minDist 안의 이웃은 밀어냄, 가까울수록 강함', () => {
      const others: [number, number][] = [[1, 0]]; // 거리 1, minDist=2
      const [px, pz] = separation(0, 0, others, 2);
      // d=1, w = (2-1)/2 = 0.5
      // 방향: (selfX - ox, selfZ - oz) = (0-1, 0-0) = (-1, 0) → [-1, 0] 정규화
      // 결과: [-1*0.5, 0*0.5] = [-0.5, 0]
      expect(px).toBeCloseTo(-0.5);
      expect(pz).toBeCloseTo(0);
    });

    it('여러 이웃의 밀어냄 합산', () => {
      const others: [number, number][] = [[1, 0], [0, 1]]; // 둘 다 거리 1, minDist=2
      const [px, pz] = separation(0, 0, others, 2);
      // 첫 번째: (0-1, 0-0) = (-1, 0) → [-1, 0] × 0.5 = [-0.5, 0]
      // 두 번째: (0-0, 0-1) = (0, -1) → [0, -1] × 0.5 = [0, -0.5]
      // 합: [-0.5, -0.5]
      expect(px).toBeCloseTo(-0.5);
      expect(pz).toBeCloseTo(-0.5);
    });

    it('같은 위치(d≈0)의 이웃은 무시하고 NaN 없음', () => {
      const others: [number, number][] = [[0, 0], [1, 0]]; // 첫 번째는 같은 위치, 두 번째는 거리 1
      const [px, pz] = separation(0, 0, others, 2);
      // 첫 번째는 skip, 두 번째만: (-0.5, 0)
      expect(px).toBeCloseTo(-0.5);
      expect(pz).toBeCloseTo(0);
      expect(Number.isNaN(px)).toBe(false);
      expect(Number.isNaN(pz)).toBe(false);
    });
  });

  describe('rollDrop', () => {
    it('rng=()=>0 이면 모든 항목이 min', () => {
      const table: Record<string, [number, number]> = { item_a: [2, 4], item_b: [1, 5] };
      const result = rollDrop(table, () => 0);
      expect(result).toEqual({ item_a: 2, item_b: 1 });
    });

    it('rng=()=>0.999999 이면 max에 가까움 (양끝 포함)', () => {
      const table: Record<string, [number, number]> = { item_a: [2, 4], item_b: [1, 5] };
      const result = rollDrop(table, () => 0.999999);
      // min + floor(0.999999 * (max - min + 1))
      // item_a: 2 + floor(0.999999 * 3) = 2 + 2 = 4
      // item_b: 1 + floor(0.999999 * 5) = 1 + 4 = 5
      expect(result).toEqual({ item_a: 4, item_b: 5 });
    });

    it('결과가 0인 항목은 제외', () => {
      const table: Record<string, [number, number]> = { drop_a: [0, 1], drop_b: [2, 4] };
      const result = rollDrop(table, () => 0);
      // drop_a: 0 + floor(0 * 2) = 0 (제외)
      // drop_b: 2 (포함)
      expect(result).toEqual({ drop_b: 2 });
    });

    it('범위 [2, 4]에서 여러 rng값이 항상 범위 내', () => {
      const table: Record<string, [number, number]> = { ore: [2, 4] };
      for (let i = 0; i < 10; i++) {
        const rng = () => i / 10;
        const result = rollDrop(table, rng);
        if ('ore' in result) {
          expect(result.ore).toBeGreaterThanOrEqual(2);
          expect(result.ore).toBeLessThanOrEqual(4);
        }
      }
    });
  });

  describe('turnToward', () => {
    it('현재 위치에서 maxStep 내면 정확히 목표 도달', () => {
      const result = turnToward(0, 0.2, 0.3);
      expect(result).toBeCloseTo(0.2);
    });

    it('maxStep보다 멀면 maxStep만큼만 이동', () => {
      const result = turnToward(0, 1.0, 0.3);
      expect(result).toBeCloseTo(0.3);
    });

    it('음의 방향도 maxStep 제한 적용', () => {
      const result = turnToward(1.0, 0, 0.3);
      expect(result).toBeCloseTo(1.0 - 0.3);
    });

    it('±π 래핑에서 최단 경로 (current=3.0, target=-3.0 → 양의 방향으로 회전)', () => {
      // current=3.0, target=-3.0
      // 차이: -3.0 - 3.0 = -6.0
      // 래핑 후 거리: ≈ 0.283 (양의 방향)
      // maxStep=1.0이므로 1.0 * Math.sign(0.283) = 0.283만큼 이동
      const result = turnToward(3.0, -3.0, 1.0);
      expect(result).toBeCloseTo(3.0 + 0.283, 1);
      // 또는 단순히 3.0보다 크고 4.0보다 작음을 확인
      expect(result).toBeGreaterThan(3.0);
      expect(result).toBeLessThan(4.0);
    });

    it('이미 목표면 불변', () => {
      const result = turnToward(1.5, 1.5, 0.5);
      expect(result).toBe(1.5);
    });
  });
});
