# 작업 보드  (상태: todo / doing / review / done)

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
| T7 | Sonnet | 내구도·마모 연동(후방 반동/전방 과충전), 자동 수리 | T3,T6 | todo |
| T8 | Sonnet | 레이드 루프, 손실 규칙(stash/carried) | T4 | todo |
| T9 | Haiku | HUD(HP/충전/재료/내구도/탈출 방향), 장착 메뉴, 사망/성공 화면 | T2,T8 | todo |
| T10 | Sonnet+Opus | 튜닝 패스(반동 감 최우선), README: 튜닝 수치·한계 | all | todo |

모델 선택 기준은 `docs/WORKFLOW.md`. 순서: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10.
