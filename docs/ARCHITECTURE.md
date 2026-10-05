# 아키텍처 계획

## 파일 구조
```
src/
  main.ts            부트스트랩 (raid 시작)
  core/types.ts      계약(인터페이스)  · core/{input,physics,events}.ts (T1)
  config/tuning.ts   모든 튜닝 수치
  data/              bases.ts parts.ts mobs.ts + loadout 계산(스탯 합산)  [Codex]
  player/            PlayerController(PointerLock, 이동, ImpulseTarget), 낙하 피해
  weapons/           WeaponSystem, MomentumLauncher, EmCoil, Durability, ConductorGraph
  mobs/              Mob(금속/절연/일반), ChaseAI                         [Codex]
  world/             MapBuilder(지형·물·금속), Extraction, LootDrop        [Codex]
  raid/              RaidLoop(상태기계), Persistence(손실 규칙), Menu 흐름
  ui/                Hud, LoadoutMenu, EndScreen                           [Codex]
```
## 핵심 시스템 경계
- **스탯 계산**: `data` 의 `computeStats(loadout)` → base.stats + 부품 add/mul (내구도 0 부품은 제외, 베이스 0이면 전체 정지). weapons 는 결과만 사용
- **반동 이동**: 발사 시 `ImpulseTarget.applyImpulse(-dir * m * v * recoilScale)`. 플레이어는 Rapier kinematic 이 아닌 **dynamic capsule 또는 자체 속도 적분**으로 임펄스를 받음 → 조작감 튜닝은 `player/` 가 담당
- **전도체 연쇄**: 월드가 `Conductor[]` 를 제공(금속 몹/구조물/물웅덩이/플레이어/아군). `ConductorGraph` 가 반경 내 BFS + 감쇠, 절연체는 비전파. 팀킬·누전 막지 않음
- **레이드 루프**: menu → raid(spawn→탐색→탈출) → result. 사망 시 `carried` 폐기, `stash` 유지. 종료 후 자동 수리 버튼
## 구현 순서 (TASKS.md 와 동일)
T1 플레이어+지형 → T2 데이터 → T3 사출기(반동) → T4 월드 → T5 몹 → T6 코일+연쇄 → T7 내구도·부품 → T8 레이드 루프·손실 → T9 UI → T10 튜닝·정리
