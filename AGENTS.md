# AGENTS.md — 공통 에이전트 지침 (Codex 가 자동으로 읽음 / Claude 는 CLAUDE.md 경유)

물리 스킬 익스트랙션 게임 웹 3D 프로토타입(1단계). **스펙 원문: `docs/SPEC.md`**, 협업 규칙: `docs/COLLAB.md`, 구조: `docs/ARCHITECTURE.md`, 작업 보드: `docs/TASKS.md`.

## 시작 순서 (매 세션)
1. `git pull --rebase`(또는 fetch) → `docs/TASKS.md` 에서 내 담당 태스크 확인
2. 작업은 **내 소유 디렉터리 안에서만**. 남의 영역은 수정 말고 TASKS 의 '요청'에 적는다
3. 끝나면 `npm run check` 통과 → TASKS 갱신 → 커밋

## 명령
- `npm run dev` 개발 서버 / `npm run check` 타입체크+빌드 (커밋 전 필수)

## 코드 규칙
- TypeScript strict. 외부 에셋 없음(기본 도형+단색). 사운드 없음
- **매직넘버 금지**: 수치는 `src/config/tuning.ts`, 무기·부품·몹 정의는 `src/data/`
- 시스템 간 통신은 `src/core/types.ts` 의 인터페이스로만 (구체 클래스 import 금지)
- 물리: Rapier(`@dimforge/rapier3d-compat`, `await RAPIER.init()` 필요)
- 범위 제외: 멀티플레이, 지식트리, 아지트, 부전공 효과, 사운드
