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
