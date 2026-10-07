# 원경 백드롭 (M1i)

황혼 프리셋의 먼 풍경(산·메사 3~4겹, 성 실루엣 + 빛기둥, 하늘의 거대한 고리·부유섬·파편, 가로 구름 띠, 계곡 안개 띠)은 2048×512 RGBA PNG 한 장이다.
하늘 그라디언트는 런타임 돔이 그리고, 이 이미지는 **알파가 있는 물체 층**만 담아 돔 위에 겹친다 (위쪽은 알파 페이드).

## 생성
```
pip install pillow numpy
python3 scripts/make_backdrop.py --preview /tmp/backdrop_preview.png   # 출력: src/assets/backdrop_dusk.png
```
입력 없음, 시드 고정(결정적), 좌우 이음새 없음(출력에 seam_diff 표시). 팔레트는 `docs/reference/world_target.jpg` 에서 샘플링한 값.
스크립트 상단 상수(해·빛기둥 방위, 안개색, 지평선 비율)는 `src/config/settings.ts` `VISUAL.lowpoly.backdrop` / `presets.dusk` 와 같은 값으로 유지한다.

## 규약
- 이미지 x 는 화면 왼→오. 방위 θ = atan2(dx, dz) (북 = -z = π), x = (1 - θ/2π)·width. (`render/backdropMath.ts`, 테스트 있음)
- 눈높이(지평선) 행 = `horizonV`·height (기본 0.62). 고도각 e 의 행 = 지평선 - tan(e)·width/2π.
- 해 방위 143도, 성·빛기둥 방위 170도 (`MAP.destinations` 의 관측소 후보와 일치, 테스트로 검증).
- 맨 아래는 런타임 안개색(0x7360a2)으로 채워 지형 끝 안개와 이어진다.

## 런타임 (render/backdrop.ts)
카메라를 따라다니는 open-ended 원통(안쪽 면), 안개 무시(fog:false), depthWrite off, 하늘 돔 다음에 그린다. 확대는 nearest(픽셀 블록 느낌, `pixelated`).

## 사용자 파노라마로 교체
1. 좌우 이음새 없는 RGBA PNG(눈높이=이미지 62% 지점, 알파 있는 층)를 만든다.
2. `src/assets/backdrop_dusk.png` 를 같은 이름으로 덮어쓴다. 크기가 다르면 `VISUAL.lowpoly.backdrop.width/height` 도 맞춘다.
   다른 파일명이면 `src/assets/backdrop_<이름>.png` 로 넣고 `backdrop.file` 만 바꾼다 (빌드는 `backdrop_*.png` 를 모두 수집).
3. 밝기는 `brightness`, 눈높이 위치는 `horizonV`, 원통 반지름/높이는 `radius`/`heightScale` 로 조정. 끄려면 `presets.dusk.features.backdrop = false`.
