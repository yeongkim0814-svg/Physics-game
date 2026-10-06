import { VISUAL } from '../config/settings';
import type { LowpolyPreset } from '../config/lowpolyPresets';

export type VisualStyle = 'lowpoly' | 'ps1';

/**
 * 현재 비주얼 스타일. 기본은 VISUAL.style, 브라우저에서는 URL `?style=ps1|lowpoly` 로 덮어쓸 수 있다(비교·롤백 확인용).
 * 모듈 로드 시 한 번 결정된다 (재질/지오메트리 생성 시점에 분기하므로 런타임 전환은 지원하지 않는다).
 */
function resolveStyle(): VisualStyle {
  try {
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search).get('style');
      if (q === 'ps1' || q === 'lowpoly') return q;
    }
  } catch { /* 검색 문자열을 못 읽으면 기본값 */ }
  return VISUAL.style;
}

export const STYLE: VisualStyle = resolveStyle();
export const isPS1 = STYLE === 'ps1';

export type TimeOfDay = 'dusk' | 'day';

/** 시간대: VISUAL.lowpoly.timeOfDay, URL `?tod=day|dusk` 로 덮어쓰기 (ps1 에서는 무시) */
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
export const isDusk = !isPS1 && TOD === 'dusk';

/** 현재 스타일의 안개/조명 수치 (GameLoop 장면 설정용) */
export const ENV: { fog: LowpolyPreset['fog']; lighting: LowpolyPreset['lighting'] } = isPS1
  ? { fog: VISUAL.fog, lighting: { sky: VISUAL.lighting.ambient, ground: VISUAL.lighting.ambientGround, hemiIntensity: VISUAL.lighting.ambientIntensity, sun: VISUAL.lighting.sun, sunIntensity: VISUAL.lighting.sunIntensity, sunDir: [...VISUAL.lighting.sunDir] as [number, number, number], sunDistance: VISUAL.lighting.sunDistance } }
  : { fog: LP.fog, lighting: LP.lighting };
