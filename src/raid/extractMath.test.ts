import { describe, expect, it } from 'vitest';
import { stepExtract } from './extractMath';

describe('extractMath', () => {
  describe('stepExtract', () => {
    it('지점 안에서 진행도가 dt만큼 오른다', () => {
      const result = stepExtract(0, true, 0.5, 1, 2);
      expect(result.progress).toBe(0.5);
      expect(result.done).toBe(false);
    });

    it('진행도가 hold에 도달하면 포화하고 done=true', () => {
      const result = stepExtract(0.8, true, 0.3, 1, 2);
      expect(result.progress).toBe(1); // min(1, 0.8 + 0.3) = 1
      expect(result.done).toBe(true);
    });

    it('지점 안에서 이미 hold 이상이면 done=true', () => {
      const result = stepExtract(1.5, true, 0.1, 1, 2);
      expect(result.progress).toBe(1); // capped at hold=1
      expect(result.done).toBe(true);
    });

    it('지점 밖에서 진행도가 decay 배로 줄어든다', () => {
      const result = stepExtract(1.0, false, 0.5, 1, 2);
      expect(result.progress).toBe(0); // 1.0 - 0.5 * 2 = 0
      expect(result.done).toBe(false);
    });

    it('지점 밖에서 진행도가 0 미만으로 내려가지 않는다', () => {
      const result = stepExtract(0.3, false, 0.5, 1, 2);
      expect(result.progress).toBe(0); // max(0, 0.3 - 0.5 * 2)
      expect(result.done).toBe(false);
    });

    it('hold=0이면 지점에 들어간 첫 프레임에 done=true', () => {
      const result = stepExtract(0, true, 0.1, 0, 2);
      expect(result.done).toBe(true);
    });

    it('hold=0, inZone=false는 done=false', () => {
      const result = stepExtract(0, false, 0.1, 0, 2);
      expect(result.done).toBe(false);
    });

    it('누적 호출: 지점 안에서 진행, 밖에서 감소', () => {
      let state = stepExtract(0, true, 0.3, 1, 2); // 지점 안, 진행도 0.3
      expect(state.progress).toBeCloseTo(0.3);
      expect(state.done).toBe(false);

      state = stepExtract(state.progress, true, 0.4, 1, 2); // 계속 지점 안, 진행도 0.7
      expect(state.progress).toBeCloseTo(0.7);
      expect(state.done).toBe(false);

      state = stepExtract(state.progress, false, 0.2, 1, 2); // 지점 밖, 진행도 감소 (0.7 - 0.2 * 2 = 0.3)
      expect(state.progress).toBeCloseTo(0.3);
      expect(state.done).toBe(false);

      state = stepExtract(state.progress, true, 0.5, 1, 2); // 다시 지점 안, 진행도 0.8
      expect(state.progress).toBeCloseTo(0.8);
      expect(state.done).toBe(false);

      state = stepExtract(state.progress, true, 0.3, 1, 2); // 도달, done=true
      expect(state.progress).toBe(1);
      expect(state.done).toBe(true);
    });

    it('지점을 나갔다 다시 들어감: decay가 적용되고 다시 증가', () => {
      let state = stepExtract(0.8, true, 0, 1, 2);
      expect(state.progress).toBe(0.8);

      state = stepExtract(state.progress, false, 0.3, 1, 2); // 0.8 - 0.3 * 2 = 0.2
      expect(state.progress).toBeCloseTo(0.2);

      state = stepExtract(state.progress, true, 0.5, 1, 2); // 0.2 + 0.5 = 0.7
      expect(state.progress).toBeCloseTo(0.7);
      expect(state.done).toBe(false);
    });

    it('done=true 후에도 inZone=true면 progress는 hold를 유지', () => {
      let state = stepExtract(0.9, true, 0.2, 1, 2); // done=true
      expect(state.progress).toBe(1);
      expect(state.done).toBe(true);

      state = stepExtract(state.progress, true, 0.1, 1, 2); // 계속 지점 안
      expect(state.progress).toBe(1);
      expect(state.done).toBe(true);
    });

    it('done=true 후에 inZone=false면 decay 적용', () => {
      let state = stepExtract(0.9, true, 0.2, 1, 2); // done=true, progress=1
      expect(state.done).toBe(true);

      state = stepExtract(state.progress, false, 0.3, 1, 2); // 지점을 벗어남
      expect(state.progress).toBe(0.4); // 1 - 0.3 * 2 = 0.4
      expect(state.done).toBe(false); // 다시 done=false
    });

    it('큰 dt로 한 번에 hold를 초과해도 포화', () => {
      const result = stepExtract(0.5, true, 1.0, 1, 2);
      expect(result.progress).toBe(1); // min(1, 0.5 + 1.0) = 1
      expect(result.done).toBe(true);
    });

    it('큰 decay로 빠르게 감소', () => {
      const result = stepExtract(0.5, false, 0.5, 1, 4);
      expect(result.progress).toBe(0); // max(0, 0.5 - 0.5 * 4) = 0
      expect(result.done).toBe(false);
    });

    it('hold=0.5, decay=2: 지점 안 진행 후 밖에서 감소', () => {
      let state = stepExtract(0, true, 0.3, 0.5, 2);
      expect(state.progress).toBe(0.3);
      expect(state.done).toBe(false);

      state = stepExtract(state.progress, true, 0.3, 0.5, 2); // 0.3 + 0.3 = 0.6, >= 0.5 → done
      expect(state.progress).toBe(0.5);
      expect(state.done).toBe(true);

      state = stepExtract(state.progress, false, 0.1, 0.5, 2); // 0.5 - 0.1 * 2 = 0.3
      expect(state.progress).toBe(0.3);
      expect(state.done).toBe(false);
    });

    it('인자가 정확히 0일 때의 동작', () => {
      const result = stepExtract(0, true, 0, 0, 0);
      expect(result.progress).toBe(0);
      expect(result.done).toBe(true); // hold=0, inZone=true → done
    });

    it('연쇄 호출: 진행→완료→퇴출→복귀 사이클', () => {
      // 진행: 0 → 0.6
      let s = stepExtract(0, true, 0.6, 1, 2);
      expect(s.progress).toBe(0.6);
      expect(s.done).toBe(false);

      // 완료: 0.6 → 1
      s = stepExtract(s.progress, true, 0.5, 1, 2);
      expect(s.progress).toBe(1);
      expect(s.done).toBe(true);

      // 퇴출: 1 → 0.2 (1 - 0.4 * 2)
      s = stepExtract(s.progress, false, 0.4, 1, 2);
      expect(s.progress).toBeCloseTo(0.2);
      expect(s.done).toBe(false);

      // 복귀: 0.2 → 0.9
      s = stepExtract(s.progress, true, 0.7, 1, 2);
      expect(s.progress).toBeCloseTo(0.9);
      expect(s.done).toBe(false);

      // 완료: 0.9 → 1
      s = stepExtract(s.progress, true, 0.2, 1, 2);
      expect(s.progress).toBe(1);
      expect(s.done).toBe(true);
    });
  });
});
