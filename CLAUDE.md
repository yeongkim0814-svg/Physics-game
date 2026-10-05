# CLAUDE.md — 물리 스킬 익스트랙션 게임 웹 3D 프로토타입 (1단계)

스펙 원문 `docs/SPEC.md` + 추가 지시 `docs/SPEC_ADDENDUM.md`(충돌 시 우선) · 구조 `docs/ARCHITECTURE.md` · 작업 보드 `docs/TASKS.md` · 모델 운용 `docs/WORKFLOW.md` · 2단계(허브·인벤토리·연구) 결과/튜닝/한계 `docs/PHASE2.md`
사용자(한국어)는 원리 중심·간결·핵심 빠짐없는 설명을 선호. 마지막에 튜닝 수치/한계를 정리한다.

## 명령
- `npm run dev` 개발 서버 / `npm run check` 타입체크+테스트+빌드 (커밋 전 필수)
- 개발 진입점: `?dev=grid`(격자 단독 테스트), `?dev=raid`(허브 생략 빠른 레이드, 저장 안 건드림)

## 코드 규칙
- TypeScript strict. 외부 에셋 없음(기본 도형+단색). 사운드 없음
- **매직넘버 금지**: 게임플레이 수치는 `src/config/tuning.ts`(허브 수치는 `TUNING.hub`), 비주얼/성능/터치는 `src/config/settings.ts`, 무기·부품·몹·아이템·노드·레시피·개량·방어구 정의는 `src/data/`
- 시스템 간 통신은 `src/core/types.ts` 인터페이스로 (구체 클래스 직접 의존 최소화)
- 물리: Rapier(`@dimforge/rapier3d-compat`, `await RAPIER.init()` 필요)
- 입력은 `core/input.ts` 의 통합 API(moveX/Y, lookDX/DY, fire, jumpPressed…)만 사용. 키/터치 직접 참조 금지
- 렌더링은 `render/` 의 PS1 재질(`createPS1Material`)만 사용 (일반 Three 재질 금지: 안개·스냅·양자화가 빠짐). 적/전도체/탈출 지점은 `CUES` 발광색으로 식별성 확보
- 허브 규칙(분석·연구·제작·정산)은 `src/hub/state.ts` 의 순수 함수에 두고 UI 는 호출만 한다. 저장은 `hub/storage.ts`(try/catch) 경유
- 범위 제외: 서버·멀티플레이, 화학·생물·지구과학 갈래, 부전공 효과, 샘플 변질, 장비 마모, 사운드

## 작업 규칙
- 작은 단위로 구현, 매 단계 실행 가능 상태 유지. 태스크 상태는 `docs/TASKS.md` 갱신
- 브랜치: 지정된 개발 브랜치에만 푸시. 커밋 메시지 `T3: 요약`
