# CLAUDE.md — 물리 스킬 익스트랙션 게임 웹 3D 프로토타입 (1단계)

스펙 원문 `docs/SPEC.md` · 구조 `docs/ARCHITECTURE.md` · 작업 보드 `docs/TASKS.md` · 모델 운용 `docs/WORKFLOW.md`
사용자(한국어)는 원리 중심·간결·핵심 빠짐없는 설명을 선호. 마지막에 튜닝 수치/한계를 정리한다.

## 명령
- `npm run dev` 개발 서버 / `npm run check` 타입체크+빌드 (커밋 전 필수)

## 코드 규칙
- TypeScript strict. 외부 에셋 없음(기본 도형+단색). 사운드 없음
- **매직넘버 금지**: 수치는 `src/config/tuning.ts`, 무기·부품·몹 정의는 `src/data/`
- 시스템 간 통신은 `src/core/types.ts` 인터페이스로 (구체 클래스 직접 의존 최소화)
- 물리: Rapier(`@dimforge/rapier3d-compat`, `await RAPIER.init()` 필요)
- 범위 제외: 멀티플레이, 지식트리, 아지트, 부전공 효과, 사운드

## 작업 규칙
- 작은 단위로 구현, 매 단계 실행 가능 상태 유지. 태스크 상태는 `docs/TASKS.md` 갱신
- 브랜치: 지정된 개발 브랜치에만 푸시. 커밋 메시지 `T3: 요약`
