import { SAVE_KEY, parseSave, serializeSave, type HubSave } from './save';

/** localStorage 는 사생활 보호 모드/차단 환경에서 throw 할 수 있다 → 읽기·쓰기 모두 실패해도 게임은 동작한다 (저장만 안 됨) */
let warned = false;
export const storage = {
  load(): HubSave {
    let raw: string | null = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { /* 읽기 불가: 새 게임 */ }
    return parseSave(raw);
  },
  save(s: HubSave) {
    try { localStorage.setItem(SAVE_KEY, serializeSave(s)); } catch {
      if (!warned) { warned = true; console.warn('저장 불가(localStorage 차단/용량): 이번 세션 진행은 저장되지 않습니다'); }
    }
  },
  /** 저장 가능한 환경인가 (UI 경고용) */
  available(): boolean {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch { return false; }
  },
};
