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
