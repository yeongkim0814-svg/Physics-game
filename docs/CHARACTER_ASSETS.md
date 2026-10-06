# 캐릭터 외부 에셋 기록 (주인공 얼굴 텍스처)

CLAUDE.md '외부 에셋 없음' 규칙의 **사용자 승인 예외 1건**.

- 파일: `src/assets/protagonist_face.png` (128x128 PNG, 약 21KB). Vite 가 `import` 로 번들하며 `base: './'` 라 GitHub Pages 상대경로에서도 로드된다.
- 출처: 사용자가 제공한 주인공 캐릭터 시트 일러스트(1254x1254 PNG) 의 EXPRESSIONS '기본(평온)' 컷. 원본 PNG 는 용량 때문에 repo 에 넣지 않는다.
- 변환 스크립트: `scripts/make_face_texture.py` (Pillow 만 사용, 재현 가능)
  `python3 scripts/make_face_texture.py <캐릭터시트.png> src/assets/protagonist_face.png`
- 변환 파라미터 (스크립트 상단 상수):
  - 컷 왼쪽 위 (378,465), 얼굴 크롭 컷 좌표 (25,40)-(97,118) = 72x78 px (광대~광대, 이마 윗단~턱끝)
  - 얼굴 실루엣 폴리곤 밖(배경·셔츠·옆머리) 픽셀은 가장 가까운 얼굴 픽셀 색으로 BFS 채움
  - LANCZOS 로 128x128 리사이즈 + UnsharpMask(radius 1.2, percent 70, threshold 2)
- 투영 매핑: `data/protagonist.ts FACE_TEX` (srcWidthPx 72, srcHeightPx 78, mPerPx 0.0021, chinY 0.03). 크롭 크기를 바꾸면 이 값도 맞춘다.
- 쓰는 곳: `player/protagonistTextures.ts faceTexture()` → 두개골 정면 5면(링 0..4)에 정면 투영 UV. 코 쐐기도 같은 투영.
- HEAD CLOSE UP 컷은 3/4 각도라 정면 투영에 부적합해 쓰지 않았다.
