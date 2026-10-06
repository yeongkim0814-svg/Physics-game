# 아키텍처 계획

> ⚠ 폐기된 익스트랙션 설계(보관용). 현행 설계: /GAME_DESIGN.md

## 파일 구조
```
src/
  main.ts            부트스트랩 (raid 시작)
  core/types.ts      계약(인터페이스)  · core/{input,physics,events}.ts (T1)
  config/tuning.ts   모든 튜닝 수치
  data/              bases.ts parts.ts mobs.ts + loadout 계산(스탯 합산)
  player/            PlayerController(PointerLock, 이동, ImpulseTarget), 낙하 피해
  weapons/           WeaponSystem, MomentumLauncher, EmCoil, Durability, ConductorGraph
  mobs/              Mob(금속/절연/일반), ChaseAI
  world/             MapBuilder(지형·물·금속), Extraction, LootDrop
  raid/              RaidLoop(상태기계), Persistence(손실 규칙), Menu 흐름
  render/            PS1Renderer(저해상도 타깃+후처리), materials(정점 스냅·어파인·안개), textures(절차 생성)
  ui/                Hud, LoadoutMenu, EndScreen
```
## 핵심 시스템 경계
- **스탯 계산**: `data` 의 `computeStats(loadout)` → base.stats + 부품 add/mul (내구도 0 부품은 제외, 베이스 0이면 전체 정지). weapons 는 결과만 사용
- **반동 이동**: 발사 시 `ImpulseTarget.applyImpulse(-dir * m * v * recoilScale)`. 플레이어는 Rapier kinematic 이 아닌 **dynamic capsule 또는 자체 속도 적분**으로 임펄스를 받음 → 조작감 튜닝은 `player/` 가 담당
- **전도체 연쇄**: 월드가 `Conductor[]` 를 제공(금속 몹/구조물/물웅덩이/플레이어/아군). `ConductorGraph` 가 반경 내 BFS + 감쇠, 절연체는 비전파. 팀킬·누전 막지 않음
- **레이드 루프**: menu → raid(spawn→탐색→탈출) → result. 사망 시 `carried` 폐기, `stash` 유지. 종료 후 자동 수리 버튼
## 구현 순서 (TASKS.md 와 동일)
T1 플레이어+지형 → T2 데이터 → T3 사출기(반동) → T4 월드 → T5 몹 → T6 코일+연쇄 → T7 내구도·부품 → T8 레이드 루프·손실 → T9 UI → T10 튜닝·정리

## 2단계 구조 (허브·인벤토리·연구 루프)
```
src/
  data/items.ts knowledge.ts recipes.ts upgrades.ts armors.ts containers.ts weaponSlots.ts equipment.ts   아이템·노드·레시피·개량·방어구 정의(코드 수정 없이 조정)
  config/tuning.ts → TUNING.hub        격자 크기·무기 슬롯·시간 배율·수리 비용·방어구 규칙·격자 UI 수치
  inventory/grid.ts                    격자 순수 로직(배치·스택·정렬·검증). grid.test.ts
  inventory/InventoryBoard.ts          터치 격자 UI (탭 선택→탭 배치, 드래그, 회전, 자동 배치, 정렬, 수량 분할)
  hub/save.ts storage.ts               HubSave(v2) 모델·불러오기 검증·localStorage(try/catch)
  hub/state.ts                         허브 규칙(분석·연구·제작·장착·수리·출격·정산) — HubSave 를 수정하는 순수 함수. state.test.ts
  hub/gear.ts compare.ts itemInfo.ts   아이템 인스턴스↔무기/방어구 스탯, 비교 표(▲▼ 색), 설명
  hub/HubShell.ts boot.ts screens/*    하단 탭 셸 + 화면 7개(+입고 선택)
  raid/RaidLoop.ts                     startRaid(root, save): save.raid 로 시작, 종료 시 settle* 후 저장 → 허브로 reload
  raid/inventory.ts                    가방 격자 위의 탄 인벤토리 뷰
  player/armor.ts                      방어구 저항·마모·이동 페널티
  ui/BagOverlay.ts                     레이드 중 가방 ↔ 안전 보관함
```
- 위치 규칙: `stash`(창고) / `safe`(안전 보관함: 레이드 획득(found)품만 입장, 사망해도 유지) / `prep`(주머니/조끼/가방 격자 + 장착 equip) / `raid`(진행 중 레이드; 남은 채 로드되면 이탈=사망) / `pending`(탈출 후 창고 초과분)
- 분석·연구는 `{startedAt, durationMs}` 타임스탬프 → 화면 이동·앱 종료와 무관하게 진행, 로드/매초 `resolveJobs` 가 확정
- 개발 진입점: `?dev=grid`(격자 단독), `?dev=raid`(허브 생략·저장 안 건드림, `&armor=plate_vest&aux=shin_guard&rear=handle&base=em_coil`)

## 새 설계 모듈 초안

유지할 모듈:
- `core/` — input, types, physics, events
- `config/tuning.ts` — 게임플레이 수치
- `config/settings.ts` — 비주얼·성능·터치 설정
- `render/` — PS1 재질·안개·후처리
- `player/` — 반동 이동, HP/스태미너
- `weapons/` — 사출기, ConductorGraph 유지
- `world/` — 지형·물·금속 구조물

신규 후보:
- `data/` — 환경·랜드마크·NPC 배치 (기존 무기 정의 대신)
- `evidence/` — 증거 카드·일지 UI [제안]
- `device/` — 기준점 장치 모듈·제출 인터페이스 [제안]
- `memory/` — 기억 장면·이미지 재생 [제안]
- `npc/` — NPC 상태·대화 [제안]
- `save/` — 저장 지점·HP/스태미너 복구 [제안]
