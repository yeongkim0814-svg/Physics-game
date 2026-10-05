# Physics Extraction Prototype

물리 스킬 익스트랙션 게임 웹 3D 프로토타입. 스펙: `docs/SPEC.md`, `docs/SPEC_ADDENDUM.md`.

```
npm install
npm run dev     # 개발 서버
npm run check   # 타입체크 + 테스트 + 빌드
```

## GitHub Pages 배포 (초보자용)
1. GitHub 에 로그인하고 우측 상단 **+ → New repository** 로 저장소를 만든다 (이미 있으면 건너뜀). Public 권장 (Private 은 유료 플랜에서만 Pages 사용 가능)
2. 이 코드를 그 저장소에 올린다. 이미 연결되어 있다면 작업 브랜치를 **main 에 병합**한다 (GitHub 저장소 페이지의 **Compare & pull request → Merge pull request**)
3. 저장소의 **Settings → Pages** 로 이동한다
4. **Build and deployment → Source** 를 **GitHub Actions** 로 선택한다 (브랜치 선택이 아님)
5. **Actions** 탭에서 *Deploy to GitHub Pages* 워크플로우가 초록색으로 끝날 때까지 기다린다 (1~3분). 실패하면 로그를 열어 확인
6. 완료 후 `https://<사용자명>.github.io/<저장소명>/` 로 접속한다 (Settings → Pages 상단에도 주소가 표시됨)
7. 이후에는 main 에 푸시할 때마다 자동으로 다시 배포된다

저장소명을 코드에 적을 필요는 없다 (상대 경로 사용). 필요하면 `VITE_BASE=/저장소명/` 환경변수로 고정.

## 튜닝 파일
- `src/config/tuning.ts` 게임플레이 수치 (반동, 마모, 연쇄 반경 …)
- `src/config/settings.ts` 비주얼(`VISUAL`, `CUES`), 성능(`PERF`), 터치(`TOUCH`)

## PS1 레트로 그래픽 파이프라인

480×270 저해상도(16:9)에서 렌더한 후, 5단계 후처리로 90년대 PS1 미학을 재현합니다.

**후처리 순서**:
1. 깊이 윤곽선: 이웃 픽셀과의 깊이 기울기로 경계 감지
2. 색 보정: 채도↓ 대비↑ 올리브-노랑 색조 + 검정 최소값(완전한 검은색 방지)
3. 비네팅: 화면 모서리 어두워짐
4. CRT: 프레임마다 변하는 그레인 + 수평 주사선
5. 바이어 디더: 채널당 16단계 양자화 + 색 띠 제거

**팔레트**:
- 배경: 올리브/카키 톤 (자유롭게 변경 가능)
- 기능색(변경 금지):
  - Cyan (0x6fc4c0): 전도체 (금속·물웅덩이)
  - Amber (0xd89a2e): 에너지·전기
  - Green (0x7fbf6a): 탈출 지점
  - Red (0xc0452e): 적·위험

**설정 파일**: `src/config/settings.ts` 의 `VISUAL.post` 에서 강도 조정 가능.

## 튜닝 포인트

**먼저 만질 값**:
- `VISUAL.post.edge`: 윤곽선 강도 (0.5~0.8 권장)
- `VISUAL.post.saturation`: 색감 생생함 (0.6~0.8)
- `VISUAL.post.black`: 검정 최소값 (0.1~0.3)
- `VISUAL.lighting`: 조명 강도 (색 16진수 값)
- `PERF.targetFps`: 자동 해상도 하강의 기준 FPS

**실기기 검증 필요**:
- 모바일 태블릿 (Adreno 650+, Mali-G77+)에서 FPS와 자동 해상도 동작
- 터치 감도 (`TOUCH.lookSensitivity`), 버튼 위치 (`TOUCH.buttons`)
- 어파인 텍스처 왜곡 (큰 면이 가깝거나 비스듬할 때): `affineTexture` 끔

## 알려진 한계

- **색 양자화**: 16단계(4비트 RGB에 유사) 때문에 색이 띠 형태로 보일 수 있습니다. `VISUAL.post.levels` 늘리면 부드러워집니다.
- **정점 조명**: 큰 면이 평평하게 밝기가 일정할 수 있습니다. PS1 특성입니다.
- **깊이 윤곽선 거짓양성**: 기울어진 면(경사로 등)에서 윤곽선이 나타날 수 있습니다. `edgeLo`/`edgeHi` 임계값 조정으로 줄일 수 있습니다.
- 비네팅으로 인한 모서리 어두워짐: `vignette` 값을 0에 가깝게 하면 없어집니다.

## 사출기 튜닝 가이드 (T3)
모두 `src/config/tuning.ts` 의 `launcher` / `player`. 반동 Δv = m·v·recoil·recoilScale / 플레이어질량 (현재 고철 8.6, 슬래그 4.3, 주괴 17.1 m/s).
- `recoilScale`(7.5): 반동 체감의 최우선 수치. 1.0 = 현실 운동량 보존(체감 거의 없음)
- `fireInterval`(0.4): 연사 간격. Δv 가 `중력×간격`(≈8 m/s)보다 크면 연사로 계속 상승, 작으면 활강. 고철이 거의 호버링이 되는 지점
- `player.recoilSlideTime`(0.45) / `slideFrictionMul`(0.08): 지상 반동 가속이 이어지는 정도
- `player.airAccel`(6): 공중 조작력. 낮을수록 반동 운동량이 보존됨
- `projectileGravity`(12), `spread.*`, `cameraKick`: 탄도/연사 퍼짐/시점 튐
- 비용: `materialsPerShot`, `durabilityCostPerShot`, `wearPerRecoil`. 재료 질량은 `src/data/materials.ts`
- 개발 테스트: `?rear=damping_spring&top=scope` 등 URL 파라미터로 부품 장착. 재료 전환 Q / AMMO 버튼

**알려진 한계**: 낙하 피해·HP 가 아직 없어 주괴 연사로 100m 이상 올라가도 위험 부담이 없다(T8 에서 낙하 피해 연결). 실기기 조작감(터치 FIRE+JUMP 동시)은 미검증.

## 맵 (T4)
`src/data/map.ts` 한 파일이 레이아웃 전부다 (블록, 계단, 물웅덩이, 전리품, 몹 스폰, 탈출 지점). 코드 수정 없이 좌표만 바꾸면 된다.
- 구역: 남쪽 스폰(평지+엄폐물) → 서쪽 물웅덩이(섬에 주괴) → 중앙 장애물 → 동쪽 금속 구조물(캣워크 3.6m, 금속 계단) → 북쪽 고지(6m, 계단 또는 반동 점프) → 북동 탈출(기둥은 안개를 무시해 어디서든 보임)
- 전도체: `GameWorld.conductors` 에 물/금속 노드 77개(`Conductor` 계약). 인접 노드 간격 ≤ 연쇄 반경이라 구조물 전체가 이어진다. `shock()` 하면 해당 구조물이 번쩍인다 (T6 코일이 사용)
- `GameWorld.isInWater(x,z)` 는 T6 누전 판정용, `mobSpawns` 는 T5 몹 배치용
- 전리품은 가까이 가면 자동 습득 (터치에서 별도 조작 불필요)
- 계단 깊이는 캡슐 지름(0.7m) 이상이어야 한다. 계단 오르기는 `player.stepHeight`(0.5) / `stepProbe`(0.3)
