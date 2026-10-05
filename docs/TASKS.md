# 작업 보드  (상태: todo / doing / review / done)

| ID | 담당 | 내용 | 의존 | 상태 |
|---|---|---|---|---|
| T0 | Claude | 환경·규약·뼈대 | - | review |
| T1 | Claude | PointerLock 플레이어(이동·점프·조준), Rapier 월드, 임시 바닥 | T0 | todo |
| T2 | Codex | `data/` 베이스 2·부품 4+ 정의, `computeStats(loadout)`, 내구도 0 처리 규칙(순수 함수, 단위 테스트 가능하게) | T0 | todo |
| T3 | Claude | 운동량 사출기: 투사체(중력), 반동 임펄스, 스프레드, 비용(재료/내구도) | T1,T2 | todo |
| T4 | Codex | 맵: 평지·장애물·고지·물웅덩이 영역·금속 구역, 탈출 지점, 전리품. `Conductor` 제공 | T0 | todo |
| T5 | Codex | 몹 3종 + 추적 AI + 근접 공격, 전도체 구현 | T4 | todo |
| T6 | Claude | 전자기 코일: 충전/방출/빔, ConductorGraph 연쇄, 누전, 충전 중 감속 | T3,T4,T5 | todo |
| T7 | Claude | 내구도·마모 연동(후방 반동/전방 과충전), 자동 수리 | T3,T6 | todo |
| T8 | Claude | 레이드 루프, 손실 규칙(stash/carried) | T4 | todo |
| T9 | Codex | HUD(HP/충전/재료/내구도/탈출 방향), 장착 메뉴, 사망/성공 화면 | T2,T8 | todo |
| T10 | 공동 | 튜닝 패스(반동 감 최우선), README: 튜닝 수치·한계 | all | todo |

## 병렬 가능 구간
T1·T2·T4 는 동시 착수 가능(Claude: T1, Codex: T2→T4).

## 요청 (상대 영역에 필요한 변경)
| From | To | 내용 | 상태 |
|---|---|---|---|

## 계약 변경 요청 (core/types.ts)
| From | 내용 | 상태 |
|---|---|---|

## 잠금
(없음)
