> **완료** — M0 정리 끝. 아래는 당시 계획과 근거(기록용). 결과: `raid/RaidLoop` → `game/GameLoop`(`startGame`), 무기는 `TUNING.launcher/coil` 고정 스탯, `?dev=` 진입점 제거, `data/`는 `map`·`mobs`만 유지, `player/damage`·`world/mapGen`은 사용 중이라 유지, `data/knowledge`는 허브 전용이라 삭제.

# M0 정리 계획 — 익스트랙션 코드 → 오픈월드 전환

`src/` 조사 결과(약 9,400줄). 미확인: `data/knowledge.ts`·`data/map.ts` 상세, `mapGen.ts`의 data 의존, `player/damage.ts` 용도.

## 분류
| 구분 | 대상 |
|---|---|
| 유지 | `core/`(types에서 `ArmorSystem` 제거), `render/`, `config/settings.ts`, `core/touch*`, `weapons/{conductorGraph,ArcEffects,Projectiles,ViewModel,Weapon,aim}`, `ui/{hud,overlays,tap}` |
| 수정 후 유지 | `config/tuning.ts`(`player·launcher·coil·world`만 남김), `weapons/{MomentumLauncher,EmCoil,launcherMath,coilMath}`(내구도·부품·재료 의존 제거, 마모 함수 삭제), `player/PlayerController`(armor 제거), `world/{GameWorld,mapGen}`, `mobs/`(적 필요성 설계 결정 후), `ui/hubStyle`→`uiStyle`, `raid/RaidLoop`→`GameLoop` |
| 폐기 | `hub/`(저장 골격 `storage`·`save` 직렬화만 재활용 검토), `inventory/`, `data/` 대부분(`map`·`mobs` 유지 후보), `player/armor`, `world/{Extraction,Loot}`, `raid/{extractMath,inventory}`, `weapons/{MeleeBlade,PlaceholderWeapon}`, `ui/{BagOverlay,EndScreen}`, `dev/` |
| 삭제할 테스트 | `inventory/grid`, `hub/state`, `data/dataIntegrity`, `data/loadout`, `raid/extractMath`, `player/armor` |

## 핵심 결합점과 해법
1. `main.ts` → `startHub/startRaid` 직접 호출: `startGame(root)`로 교체, `?dev=` 분기 제거.
2. `RaidLoop` → hub/inventory/data 다수 import: save·정산·가방·방어구·탈출 코드 제거, 무기는 `TUNING.launcher/coil` 고정 스탯으로 생성.
3. `MomentumLauncher`/`EmCoil` → `computeStats`·`wearDurability`·`PARTS`·`Inventory`: 고정 스탯 객체로 대체, `disabled` 분기·재료 탄약은 카운터/쿨다운으로.
4. `PlayerController.armor` 제거, `takeDamage`는 값 그대로.
5. `GameWorld` → `data/map`, `Loot`, `Extraction`: 블록 정의만 새 월드 데이터로 유지.

## 순서
무기를 고정 스탯으로 → RaidLoop 단순화 + main.ts 교체 → 폐기 파일 일괄 삭제 → `npm run check`.

## 핵심 메카닉 진입점
- 반동 이동: `weapons/MomentumLauncher.ts`, `player/PlayerController.ts:applyImpulse`, `weapons/launcherMath.ts:recoilImpulse`
- 전도체 연쇄: `weapons/conductorGraph.ts:propagate`, `weapons/EmCoil.ts`
- PS1 렌더: `render/retro.ts:RetroPipeline`, `render/snap.ts:patchRetro`, `config/settings.ts`
