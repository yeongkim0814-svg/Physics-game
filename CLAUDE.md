# CLAUDE.md — 싱글 오픈월드 과학 탐험 게임

설계 원문 `GAME_DESIGN.md` (충돌 시 우선) · 모델 운용 `docs/WORKFLOW.md`
사용자(한국어)는 원리 중심·간결·핵심 빠짐없는 설명을 선호. 마지막에 튜닝 수치/한계를 정리한다.

## 명령
- `npm run dev` 개발 서버 / `npm run check` 타입체크+테스트+빌드 (커밋 전 필수)
- 개발 진입점: `?dev=grid`(격자 단독, 폐기 예정), `?dev=raid`(빠른 시작, 폐기 예정)

## 코드 규칙
- TypeScript strict. 외부 에셋 없음(기본 도형+단색).
- **매직넘버 금지**: 게임플레이 수치는 `src/config/tuning.ts`, 비주얼/성능/터치는 `src/config/settings.ts`, 데이터 정의는 `src/data/`
- 시스템 간 통신은 `src/core/types.ts` 인터페이스로 (구체 클래스 직접 의존 최소화)
- 물리: Rapier(`@dimforge/rapier3d-compat`, `await RAPIER.init()` 필요)
- 입력은 `core/input.ts` 의 통합 API(moveX/Y, lookDX/DY, fire, jumpPressed…)만 사용. 키/터치 직접 참조 금지
- 렌더링은 `render/` 의 PS1 재질(`createPS1Material`)만 사용 (일반 Three 재질 금지: 안개·스냅·양자화가 빠짐). 아이템/NPC/기준점은 발광색으로 식별성 확보
- 범위 제외: 서버·멀티플레이, 전투 필수화, 인벤토리·스킬 트리, 사운드

## 작업 규칙
- 작은 단위로 구현, 매 단계 실행 가능 상태 유지. 태스크 상태는 `docs/TASKS.md` 갱신
- 브랜치: 지정된 개발 브랜치에만 푸시. 커밋 메시지 `T3: 요약`
