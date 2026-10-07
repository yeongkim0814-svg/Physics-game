import { VISUAL } from '../config/settings';
import type { LowpolyPreset } from '../config/lowpolyPresets';

export type TimeOfDay = 'dusk' | 'day';

/** 시간대: VISUAL.lowpoly.timeOfDay, URL `?tod=day|dusk` 로 덮어쓰기 (모듈 로드 시 한 번 결정) */
function resolveTod(): TimeOfDay {
  try {
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search).get('tod');
      if (q === 'day' || q === 'dusk') return q;
    }
  } catch { /* 기본값 */ }
  return VISUAL.lowpoly.timeOfDay;
}

export const TOD: TimeOfDay = resolveTod();
/** 활성 로우폴리 시간대 프리셋 (안개·조명·하늘·지형 팔레트·캐릭터 보정 등) */
export const LP = VISUAL.lowpoly.presets[TOD];

/** 안개/조명 수치 (GameLoop 장면 설정용) */
export const ENV: { fog: LowpolyPreset['fog']; lighting: LowpolyPreset['lighting'] } = { fog: LP.fog, lighting: LP.lighting };
