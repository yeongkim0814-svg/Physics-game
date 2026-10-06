#!/usr/bin/env python3
"""주인공 얼굴 텍스처 생성 (M1h, 사용자 승인 예외: CLAUDE.md '외부 에셋 없음' 규칙의 1건).

입력: 사용자가 제공한 캐릭터 시트 PNG (EXPRESSIONS 의 '기본(평온)' 컷). 원본은 repo 에 넣지 않는다.
출력: 얼굴 크롭을 축소한 PNG (기본 128x128, src/assets/protagonist_face.png).

사용법:
  python3 scripts/make_face_texture.py <캐릭터시트.png> [출력.png]

변환 파라미터는 아래 상수 (docs/CHARACTER_ASSETS.md 에 같은 값을 기록).
데이터 쪽 투영 매핑(data/protagonist.ts FACE_TEX)의 srcWidthPx/srcHeightPx 는 CROP 의 크기와 일치해야 한다.
"""
import sys

from PIL import Image, ImageFilter

# 시트(1254x1254) 안의 '기본(평온)' 컷 왼쪽 위 모서리, 그리고 그 컷 안에서의 얼굴 크롭 (컷 좌표: x0,y0,x1,y1)
CUT_ORIGIN = (378, 465)
CROP = (25, 40, 97, 118)          # 72 x 78 px: 광대~광대, 이마 윗단~턱끝
OUT_SIZE = 128                     # 정사각 출력 (가로 72→128, 세로 78→128 로 약간 늘어난다: UV 매핑이 보정)
# 얼굴 실루엣 폴리곤 (컷 좌표): 이 밖(배경·셔츠)은 가장 가까운 얼굴 픽셀 색으로 채운다 (턱선이 좁아지는 곳의 배경 번짐 방지)
FACE_POLY = [
    (24, 40), (97, 40), (98, 58), (98, 76), (90, 88), (83, 98), (77, 108), (68, 117), (62, 119),
    (54, 116), (46, 108), (40, 96), (38, 84), (38, 72), (30, 64), (24, 56),
]
UNSHARP = dict(radius=1.2, percent=70, threshold=2)   # 확대 후 약한 샤프닝(안경테·눈 선명도)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else 'src/assets/protagonist_face.png'
    im = Image.open(src).convert('RGB')
    ox, oy = CUT_ORIGIN
    box = (ox + CROP[0], oy + CROP[1], ox + CROP[2], oy + CROP[3])
    crop = im.crop(box)

    # 폴리곤 마스크 → 마스크 밖 픽셀을 가장 가까운 안쪽 픽셀 색으로 (다중 소스 BFS, 순수 PIL/표준 라이브러리)
    from collections import deque
    from PIL import ImageDraw
    mask_img = Image.new('L', crop.size, 0)
    ImageDraw.Draw(mask_img).polygon([(x - CROP[0], y - CROP[1]) for x, y in FACE_POLY], fill=255)
    px, mk = crop.load(), mask_img.load()
    w, h = crop.size
    seen = [[mk[x, y] > 0 for x in range(w)] for y in range(h)]
    q = deque((x, y) for y in range(h) for x in range(w) if seen[y][x])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx]:
                seen[ny][nx] = True
                px[nx, ny] = px[x, y]
                q.append((nx, ny))

    out = crop.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).filter(ImageFilter.UnsharpMask(**UNSHARP))
    out.save(dst, optimize=True)
    print(f'saved {dst} {out.size} from crop {box}')


if __name__ == '__main__':
    main()
