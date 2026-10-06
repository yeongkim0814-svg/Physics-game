# 작업 보드  (상태: todo / doing / review / done)

> ⚠ 폐기된 익스트랙션 설계(보관용). 현행 설계: /GAME_DESIGN.md

| ID | 모델 | 내용 | 의존 | 상태 |
|---|---|---|---|---|
| T0 | Sonnet | 환경·뼈대 | - | done |
| T1 | Sonnet | PointerLock 플레이어(이동·점프·조준), Rapier 월드, 임시 바닥 | T0 | done |
| T1b | Sonnet | 추가지시 기반: Pages 배포, 터치 입력 추상화, PS1 렌더 파이프라인, 설정 파일 | T1 | done |
| T2 | Sonnet(직접) | `data/` 베이스 2·부품 4+ 정의, `computeStats(loadout)`, 내구도 0 처리 규칙(순수 함수, 단위 테스트 가능하게) | T0 | done |
| T3 | Sonnet+Haiku(테스트) | 운동량 사출기: 투사체(중력), 반동 임펄스, 스프레드, 비용(재료/내구도) | T1,T2 | done |
| T4 | Sonnet+Haiku(테스트) | 맵: 평지·장애물·고지·물웅덩이 영역·금속 구역, 탈출 지점, 전리품. `Conductor` 제공 | T0 | done |
| T5 | Sonnet+Haiku(테스트) | 몹 3종 + 추적 AI + 근접 공격, 전도체 구현 | T4 | done |
| T6 | Sonnet+Haiku(테스트) | 전자기 코일: 충전/방출/빔, ConductorGraph 연쇄, 누전, 충전 중 감속 | T3,T4,T5 | done |
| T7 | Sonnet | 내구도·마모 연동(후방 반동/전방 과충전), 자동 수리 | T3,T6 | done |
| T8 | Sonnet+Haiku(테스트) | 레이드 루프, 손실 규칙(stash/carried) | T4 | done |
| T9 | Haiku | HUD(HP/충전/재료/내구도/탈출 방향), 장착 메뉴, 사망/성공 화면 | T2,T8 | todo |
| T10 | Sonnet+Opus | 튜닝 패스(반동 감 최우선), README: 튜닝 수치·한계 | all | todo |

모델 선택 기준은 `docs/WORKFLOW.md`. 순서: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10.

## 2단계: 아지트(허브) + 격자 인벤토리 + 연구 루프 (`docs/PHASE2.md`)
| ID | 내용 | 상태 |
|---|---|---|
| P2-1 | 데이터 모델(아이템·노드·레시피·개량·방어구) + 격자 인벤토리 로직/UI(`inventory/`) + 단독 테스트 `?dev=grid` | done |
| P2-2 | 허브 셸(하단 탭) + 화면 7개 + 입고 선택, 저장(localStorage v2) | done |
| P2-3 | 레이드 연결: 출격 → 가방/무기/방어구, 탈출 입고·사망 손실·안전 보관함, 레이드 중 BAG 화면, 맵에 샘플·연구 재료 | done |

## 새 설계 마일스톤
| 마일스톤 | 내용 | 상태 |
|---|---|---|
| M0 | 폐기 코드 제거(계획: `docs/M0_CLEANUP.md`) | done |
| M1 | 수직 슬라이스: 말라붙은 해안 도시 일부 + 반동 도구 + 쌍둥이 낙하 실험 + 증거 카드·제출 UI + 저장 지점/HP/스태미너 | doing |
| M1(a) | 해안 도시 지형(탑·협곡·폐허·원경 랜드마크) + 석양 팔레트 + 돌 던지기 실험 환경(`world/Throwables.ts`, `onLanded` 이벤트) | done |
| M1e | 3인칭 전환: 어깨 너머 카메라(충돌), 총구→조준점 발사, 교체 가능한 CharacterModel(placeholder), 참고 이미지 색감·질감(하늘 돔·벽돌/구리/모래 텍스처·조명) | done |
| M1f | 주인공 모델: `CharacterModel` 구현체(`protagonistCharacter`, 데이터 `data/protagonist.ts`) — 안경 쓴 전직 과학자, 구부정한 탐험가 자세, 걷기/공중/조준/반동/숨쉬기. placeholder 는 폴백 유지 | done |
| M1g | 비주얼 전환(BotW풍 로우폴리): `VISUAL.style` 프리셋(기본 lowpoly, ps1 롤백 유지), 재질 팩토리 `createMaterial`, 낮 하늘 돔·해·구름, 플랫 셰이딩+정점색, 네이티브 해상도 파이프라인(+선택 외곽선), 탈색 파라미터(재질/지역), 장식·블롭 그림자 | done |
| M1h | 주인공 재제작(일러스트 기준): 날씬한 7.4등신 로프트 로우폴리(≈1,900 tri)·정점 AO·천 텍스처·림 라이트, 얼굴 텍스처(일러스트 크롭, 정면 투영), 태블릿형 휴대 장치, 발 접지 보정, 재질 selfGlow/rim 옵션 | done |
| M1i | 황혼 블록 비주얼+원경 백드롭: `timeOfDay` 프리셋(dusk 기본/day 보관), 블록 지형 모자이크 빌더·계단식 단차·메사·협곡 돌출, 생성 백드롭 파노라마(`scripts/make_backdrop.py`), 탑 빛기둥·청록 창문·떠 있는 파편·높이 안개 면, 캐릭터 조명 재조정 | done |
| M1j | 주인공 복셀 카빙: 사용자 도면(정면·측면·후면)을 `scripts/carve_character.py` 로 부위별 슈퍼엘립스 카빙·투영 색칠·팔레트 양자화 → `protagonist_voxels.json`, 런타임 그리디 메싱(≈5,800 tri, 19 메시)·복셀 AO·부위 그룹(머리/몸통/골반/팔/다리/부츠/앞뒤 자락/천 자락/발광 장치) 절차 애니메이션. 기존 M1h 모델은 `?char=legacy` 폴백으로 유지 | done |
| M1(b) | todo | todo |
| M1(c) | 증거 카드(onLanded 기록 → 카드) | todo |
| M1(d) | todo | todo |
| M2 | 1~3단계 재미 검증 (낙하·관성·반작용) | todo |
| M3 | 2~3막 확장 (4~8단계, 환경·NPC·기억 장면) | todo |
