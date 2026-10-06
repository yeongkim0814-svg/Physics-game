# CLAUDE.md — 싱글 오픈월드 과학 탐험 게임

설계 원문 `GAME_DESIGN.md` (충돌 시 우선) · 모델 운용 `docs/WORKFLOW.md`
사용자(한국어)는 원리 중심·간결·핵심 빠짐없는 설명을 선호. 마지막에 튜닝 수치/한계를 정리한다.

## 명령
- `npm run dev` 개발 서버 / `npm run check` 타입체크+테스트+빌드 (커밋 전 필수)

## 코드 규칙
- TypeScript strict. 외부 에셋 없음(기본 도형+단색/정점색).
- **매직넘버 금지**: 게임플레이 수치는 `src/config/tuning.ts`, 비주얼/성능/터치는 `src/config/settings.ts`, 데이터 정의는 `src/data/`
- 시스템 간 통신은 `src/core/types.ts` 인터페이스로 (구체 클래스 직접 의존 최소화)
- 물리: Rapier(`@dimforge/rapier3d-compat`, `await RAPIER.init()` 필요)
- 입력은 `core/input.ts` 의 통합 API(moveX/Y, lookDX/DY, fire, jumpPressed…)만 사용. 키/터치 직접 참조 금지
- 렌더링: 스타일 프리셋 `VISUAL.style` ('lowpoly' 기본 = BotW풍 밝은 로우폴리·플랫 셰이딩·네이티브 해상도 / 'ps1' = 롤백용 PS1 파이프라인). 재질은 반드시 `render/materials.ts` 의 `createMaterial`(= `lambert` alias) **재질 팩토리 경유**(일반 Three 재질 직접 생성 금지: 안개·스타일 분기·탈색 파라미터가 빠짐). 아이템/NPC/기준점은 발광색으로 식별성 확보, 이상 지역은 탈색(채도)으로 표현
- 3인칭 어깨 너머 시점: 카메라=`player/ThirdPersonCamera`, 캐릭터는 `player/CharacterModel` 인터페이스(교체 지점 `createPlayerCharacter()`, 현재 `placeholderCharacter`). 발사/던지기는 총구(손)→화면 중앙 조준점 방향(`weapons/aim.ts`), 반동은 실제 발사 방향의 반대
- 범위 제외: 서버·멀티플레이, 전투 필수화, 인벤토리·스킬 트리, 사운드

## 작업 규칙
- 작은 단위로 구현, 매 단계 실행 가능 상태 유지. 태스크 상태는 `docs/TASKS.md` 갱신
- 브랜치: 지정된 개발 브랜치에만 푸시. 커밋 메시지 `T3: 요약`
