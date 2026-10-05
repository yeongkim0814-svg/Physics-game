# Claude Code ↔ Codex 협업 규약

## 원칙
같은 저장소·같은 브랜치 규칙을 쓰되, **디렉터리 소유권으로 충돌을 원천 차단**한다. 계약은 `src/core/types.ts`, 수치는 `src/config/tuning.ts`.

## 역할 / 소유 디렉터리
| 영역 | 소유 | 비고 |
|---|---|---|
| `src/core/`, `src/config/tuning.ts`(구조) | **Claude** | 계약 변경은 Claude만. 튜닝 *값* 변경은 누구나 가능(커밋 메시지에 명시) |
| `src/player/`, `src/weapons/` | **Claude** | 반동 이동 조작감(최우선), 코일 충전/연쇄, 내구도·마모 |
| `src/raid/`, `src/main.ts` | **Claude** | 게임 루프, 레이드 상태, 통합 |
| `src/data/` | **Codex** | 베이스/부품/몹 데이터 정의 + 로더/검증 |
| `src/mobs/` | **Codex** | 몹 3종, 추적 AI, 근접 공격 |
| `src/world/` | **Codex** | 맵(평지/장애물/고지/물웅덩이/금속구역), 탈출 지점, 전리품 |
| `src/ui/` | **Codex** | HUD, 장착 메뉴, 사망/성공 화면 |
| `docs/` | 공동 | TASKS.md 는 둘 다 갱신 |

## 작업 흐름
1. 브랜치: 에이전트별 `claude/<task>`, `codex/<task>`. main 직접 푸시 금지, 통합은 PR(리뷰어=상대 에이전트/사용자)
2. 태스크는 `docs/TASKS.md` 의 ID(T1…)로 참조. 시작 시 상태를 `doing`, 끝나면 `review`
3. 상대 영역에 필요한 변경은 TASKS '요청' 표에 한 줄 기록 (직접 수정 금지)
4. 인터페이스 합의: 모든 상호작용은 `core/types.ts` (Damageable, Conductor, ImpulseTarget…). 구현 전에 필요한 메서드가 없으면 '계약 변경 요청'
5. 커밋 전 `npm run check`. 커밋 메시지: `[claude|codex] T3: 요약`
6. 리뷰: 상대가 만든 PR 은 (a) 계약 준수 (b) 매직넘버 (c) 스펙 완료기준 매핑 을 확인

## 충돌 시
소유자가 우선. 동일 파일 동시 수정이 불가피하면 TASKS 에 잠금(`lock: path @agent`)을 적고 작게 나눠 순서대로 머지.
