# CLAUDE.md — 싱글 오픈월드 과학 탐험 게임

설계 원문 `GAME_DESIGN.md` (충돌 시 우선) · 그래픽 구현 지침 `OPEN_WORLD_ART_DIRECTION.md` (§0 정합 결정이 본문보다 우선, 아트 Phase 1~8) · 모델 운용 `docs/WORKFLOW.md`
사용자(한국어)는 원리 중심·간결·핵심 빠짐없는 설명을 선호. 마지막에 튜닝 수치/한계를 정리한다.

## 명령
- `npm run dev` 개발 서버 / `npm run check` 타입체크+테스트+빌드 (커밋 전 필수)

## 코드 규칙
- TypeScript strict. 외부 에셋 없음(기본 도형+단색/정점색).
- **예외(사용자 승인)**: 주인공 에셋 — `src/assets/protagonist_voxels.json` 은 사용자 제공 도면(정면·측면·후면 PNG)에서 `scripts/carve_character.py` 로 변환한 복셀 데이터다(기본 주인공, M1j). 폴백(`?char=legacy`, M1h 로프트 메시)이 쓰는 얼굴 텍스처 `src/assets/protagonist_face.png` 도 사용자 제공 일러스를 변환한 외부 에셋이며 폴백이 남아 있는 동안 유지한다 (`docs/CHARACTER_ASSETS.md`). 그 외 에셋 금지
- **매직넘버 금지**: 게임플레이 수치는 `src/config/tuning.ts`, 비주얼/성능/터치는 `src/config/settings.ts`, 데이터 정의는 `src/data/`
- 시스템 간 통신은 `src/core/types.ts` 인터페이스로 (구체 클래스 직접 의존 최소화)
- 물리: Rapier(`@dimforge/rapier3d-compat`, `await RAPIER.init()` 필요)
- 입력은 `core/input.ts` 의 통합 API(moveX/Y, lookDX/DY, fire, jumpPressed…)만 사용. 키/터치 직접 참조 금지
- 렌더링: 로우폴리·플랫 셰이딩·네이티브 해상도 단일 파이프라인(PS1 프리셋은 삭제됨). 재질은 반드시 `render/materials.ts` 의 `createMaterial`(= `lambert` alias) **재질 팩토리 경유**(일반 Three 재질 직접 생성 금지: 안개·탈색 파라미터가 빠짐). 시간대 프리셋 `VISUAL.lowpoly.timeOfDay`('dusk' 기본 = 영원한 황혼 블록 룩 / 'day' = 낮, URL `?tod=day`; 수치는 `config/lowpolyPresets.ts`, 지형은 `world/blockTerrain.ts` 모자이크 빌더 + A2 계단형 하이트필드 `world/terrain/*`(고원·협곡·계곡·메사·산맥, 충돌=trimesh, 수치 `config/terrainParams.ts`·레이아웃 `MAP.terrain`, `docs/TERRAIN.md`), 높이 안개는 `createMaterial` 셰이더 패치(`presets.*.fog.height`), 원경은 `render/backdrop.ts` 파노라마 백드롭 `src/assets/backdrop_dusk.png`). 아이템/NPC/기준점은 발광색으로 식별성 확보, 이상 지역은 탈색(채도)으로 표현
- 3인칭 어깨 너머 시점: 카메라=`player/ThirdPersonCamera`, 캐릭터는 `player/CharacterModel` 인터페이스(교체 지점 `createPlayerCharacter()`: 기본 `voxelCharacter`(복셀 카빙), `?char=legacy` 폴백 `protagonistCharacter`, 최후 `placeholderCharacter`). 발사/던지기는 총구(손)→화면 중앙 조준점 방향(`weapons/aim.ts`), 반동은 실제 발사 방향의 반대
- **생성 에셋 허용**: `scripts/make_backdrop.py` 처럼 입력 없이 재현 가능한 생성 스크립트로 만든 에셋(`src/assets/backdrop_dusk.png`)은 '외부 에셋 없음' 위반이 아니다 (생성법 `docs/BACKDROP.md`)
- **그래픽 기준 v2 (2026-10-06, `OPEN_WORLD_ART_DIRECTION.md` §0 '그래픽 기준 v2'가 최우선)**: 로우폴리 삼각형·플랫 셰이딩·**저해상도 스타일 텍스처(절차 생성, NearestFilter, 외부 파일 금지)**·정점색 변화·단순 모듈식 건축·대규모 환경 실루엣·보라 볼류메트릭 안개·대기 원근·**청록 발광 기술**·호박 조명·시네마틱 석양 팔레트. 색 역할: 호박=빛/에너지, 보라=대기/거리, 청록=기술/단서, 갈색·구리=지면. 장식 청록은 정적·약하게, 전도체 단서 청록은 밝게+맥동으로 구분하고 이상 현상의 1순위 신호는 여전히 탈색. 텍스처는 `render/texKit.ts`(절차 아틀라스) + `createMaterial` 의 `tex` 옵션으로만 붙인다(월드 좌표 트리플래너, UV 불필요). 기존 '텍스처 없음'(GAME_DESIGN 14절)은 이 항목이 대체
- **아트 작업 규칙** (`OPEN_WORLD_ART_DIRECTION.md` §26): 렌더 엔진(WebGL2)·`package.json`·물리 엔진·카메라 구조·저장 시스템을 임의로 바꾸지 않는다(필요하면 먼저 분석·보고). 기존 코드를 읽고 최소 변경, 재질은 `createMaterial` 재사용, 새 재질 남발 금지(재질·메시 재사용, InstancedMesh)
- 범위 제외: 서버·멀티플레이, 전투 필수화, 인벤토리·스킬 트리, 사운드

## 작업 규칙
- 작은 단위로 구현, 매 단계 실행 가능 상태 유지. 태스크 상태는 `docs/TASKS.md` 갱신
- 브랜치: 지정된 개발 브랜치에만 푸시. 커밋 메시지 `T3: 요약`
