# 캐릭터 외부 에셋 기록 (주인공)

CLAUDE.md '외부 에셋 없음' 규칙의 **사용자 승인 예외**. 현재 주인공은 사용자가 준 도면을 스크립트로 변환한 **복셀 에셋**이고(M1j), 직전 구현(M1h 로프트 메시 + 얼굴 텍스처)은 폴백으로 남아 있다.

## 1. 복셀 주인공 (M1j, 기본)

- 파일: `src/assets/protagonist_voxels.json` (약 12KB: 팔레트 + RLE(varint+base64) + 관절 피벗). Vite 가 JSON import 로 번들한다.
- 출처: 사용자가 제공한 주인공 도면(1536x1024 PNG, 정면·오른쪽 측면·후면 3컷). 원본 PNG 는 용량 때문에 repo 에 넣지 않고, 확인용 축소본(가로 1280px JPEG)만 `docs/reference/character_turnaround.jpg` 에 둔다 (빌드 미포함).
- 생성 스크립트: `scripts/carve_character.py` (Python3 + numpy + OpenCV(`opencv-python-headless`). 입력 외 난수 없음, k-means 시드 고정 → **결정적**)

  ```
  python3 scripts/carve_character.py <도면.png> [--out src/assets/protagonist_voxels.json] [--debug 폴더]
  # 실험용 덮어쓰기: --height N --colors N --median K --smooth N
  ```
  `--debug` 는 마스크 오버레이(`mask_*.png`), 부위 분할 투영(`parts_*.png`), 카빙 결과 투영(`carve_*.png`)을 저장한다.
- 런타임: `src/player/voxelCharacter.ts` (`createPlayerCharacter()` 의 기본 반환). 폴백 전환: URL `?char=legacy` 또는 `VISUAL.characterModel = 'legacy'`.

### 1-1. 파이프라인과 파라미터 (스크립트 상단 상수와 동일)

1. **전경 분할**. 도면 배경은 마젠타 크로마키가 아니라 어두운 비네팅 + 인물 주변 주황/흰 후광이라 색 기반(GrabCut)이 실패한다(어두운 부츠·머리·천이 배경과 비슷, 밝은 실험복이 후광과 비슷). 인물은 도트 윤곽선이 있고 후광은 매끄러운 그라디언트라는 점을 이용한다: 가로 3등분 → 가우시안(σ `EDGE_BLUR`=1.2) 후 채널 최대 Sobel 크기 > `EDGE_T`(2.5) = 경계 → `EDGE_DILATE`(7) 팽창으로 윤곽 틈 메움 → 가장자리에서 flood fill 한 배경의 보집합 = 전경 → `MASK_ERODE`(5) 침식, `MASK_CLOSE`(13) 닫기, 구멍 메우기, 열기, 최대 연결 성분. 색 샘플용 마스크는 원본 px 기준 `COLOR_ERODE_PX`(3) 더 침식해 후광 번짐을 제외한다.
2. **정규화**. 컷별 마스크 바운딩박스(정수리~발바닥)를 **`VOXEL_HEIGHT`=72 칸**으로 같은 키에 맞춘다(복셀 한 변 = 1.8/72 = 2.5cm). 칸 색 = 마스크 안쪽 픽셀 평균(INTER_AREA), 칸 안에 전경이 없으면 가장 가까운 칸 색. 얼굴 칸은 블록 최소 휘도 비율을 `HEAD_DARK_GAIN`(0.7)만큼 섞어 안경테·눈 같은 가는 어두운 선이 평균에 묻히지 않게 한다. 몸 색에는 `COLOR_MEDIAN`(3) 중앙값 필터를 적용한다(외톨이 색 제거 → 면 병합 증가).
3. **격자/축**. x = 캐릭터 오른쪽 +(정면 컷은 이미지 왼쪽), z = 뒤 +(앞 = -z), y = 위 +. 좌우 축은 어깨~가슴 행 마스크 좌우 끝 중점의 중앙값, 깊이 축은 측면 마스크의 같은 방식 값.
4. **부위 분할(카빙)**. 정면 마스크를 행(높이 비율 h)별로 나눈다. 단순 비주얼 헐(정면∩측면)은 팔이 몸통 두께로 두꺼워지고 단면이 직사각형이라 부위별로 처리한다.

   | 높이 h (발바닥 0 ~ 정수리 1) | 영역 | 부위 |
   |---|---|---|
   | ≥ 0.865 (`HEAD_BOTTOM_H`) | 마스크 전체 | head |
   | 0.385 ~ 0.865 | `|x|` > 몸통 반폭(`TORSO_HALF` 앵커 보간, 키 비율 0.06~0.166) | 팔 (오른쪽 +x / 왼쪽). 어깨~팔꿈치(`ELBOW_H`=0.652) = upper, 그 아래 손까지 = fore |
   | 0.583 이상 (`WAIST_H`) | 몸통 반폭 안쪽 | torso |
   | 0.500 (`HIP_H`) ~ 0.583 | 〃 | pelvis |
   | 0.285 (`HEM_LO_H`) ~ 0.500 | 마스크 전체(바지는 자락에 가려짐) | skirtF / skirtB (자락 z 중앙으로 앞/뒤 분할) |
   | 0.245 (`KNEE_H`) ~ 0.285 | x 부호로 좌/우 | thigh |
   | 0.085 (`ANKLE_H`) ~ 0.245 | 〃 | shin (부츠 목 포함) |
   | < 0.085 | 〃 | foot (부츠 앞쪽) |
   | 오른손 높이 0.36~0.53 의 어두운(휘도 < 80)/청록 칸 중 최대 연결 성분 | 장치 | device (두께 `DEVICE_DEPTH`=4, 슈퍼엘립스 지수 6) |

   - **깊이(z)**: 머리·몸통·자락·다리는 측면 마스크의 그 행 앞뒤 범위. 다리는 두께 상한 = 정면 폭 × `LEG_DEPTH_RATIO`(1.25)(발 제외: 앞코가 길다). **팔은 측면 마스크가 몸통과 겹쳐 쓸 수 없어** 두께 = 정면 폭 × `ARM_DEPTH_RATIO`(0.85)를 [3, 8] 칸으로 제한하고, 중심 z = 같은 행 몸통 z 중심 + `ARM_Z_ANCHORS`(측면 도면에서 잰 키 비율 -0.012~+0.012 보간).
   - **단면**: 직사각형 대신 슈퍼엘립스 `|dx/hx|^n + |dz/hz|^n ≤ 1` (`SUPER_N`: head 2.3, torso 2.8, pelvis 2.8, skirt 3.0, arm 2.3, leg 2.6, foot 3.0, device 6.0).
   - 윤곽 잡음 제거: 부위의 좌우/앞뒤 범위 시계열을 `EXTENT_MEDIAN`(5) 행 중앙값 필터 (계단 면 감소 → 삼각형 감소).
5. **색칠**. 정면 컷 → 각 (x,y) 열의 맨 앞 복셀, 후면 컷 → 맨 뒤 복셀, 측면 컷 → +x 쪽 첫 복셀과 -x 쪽 첫 복셀(왼쪽 = 오른쪽 미러). 우선순위 정면 > 후면 > 측면. 후면 컷은 정면과 스케일·자세가 달라 **행·부위(머리/몸/팔L/팔R/다리L/다리R/장치)별로 좌우 범위를 선형 정합**해 샘플링한다(팔 위치가 도면마다 다른 문제 완화). 미관측 표면 복셀은 3D 최근접 칠한 복셀 색, 내부(6방향 모두 찬) 복셀은 부위 최빈색(분할면이 큰 단색 면으로 병합되게).
6. **양자화**. k-means(시드 `KMEANS_SEED`=7): 몸 `PALETTE_COLORS`=14색 + 머리 전용 `HEAD_COLORS`=5색(피부·머리카락·안경테·그늘) + 발광 청록 1~2색. 외톨이 색 복셀은 같은 부위 이웃 다수색으로 교체(`SMOOTH_PASSES`=3, `SMOOTH_MIN_SAME`=3). 발광 화면 = 정면 첫 층 장치 복셀 중 원본에서 밝은 청록 픽셀(g,b > 170, r < 130)이 칸의 12% 이상인 곳(후광 제외) → 팔레트의 `emissive` 목록.
7. **어깨 천 자락**: 벨트 아래(h < 0.575)에서 정면/후면에 직접 칠해진 천색(어두운 청록회색: b-r ≥ 5, g-r ≥ 3, 휘도 45~125) 표면 복셀은 `sashF`/`sashB` 부위로 분리(한 겹 얇은 껍질 → 흔들림). 톱니 자락: 자락 바로 아래 허벅지/정강이 중 실험복색(휘도 > 150) 표면 복셀은 skirtF 로 편입.
8. **피벗**(월드 m, 루트 = 발바닥 중앙): 허리·목·어깨·팔꿈치·고관절·무릎·발목·자락·천 자락 2·장치 총구(아래 끝 앞면)/손(위쪽 1/4) 를 부위 바운딩박스와 높이 비율 랜드마크로 계산해 JSON `pivots` 에 둔다.

### 1-2. JSON 형식

`{version, size[nx,ny,nz], voxelSize, origin[3], parts[], palette[hex], emissive[idx], pivots{}, rle}`. 셀 중심 월드 좌표 = (인덱스 - origin) × voxelSize. `rle` = 심볼 `(부위id << 6) | 팔레트번호(1..)` (0 = 빈칸)의 (심볼, 연속길이) 쌍을 LEB128 varint 로 쓴 바이트열의 base64. 순서 = y(아래→위) 바깥, z(앞→뒤), x(왼쪽→오른쪽) 안쪽. 해석: `src/player/voxelCodec.ts`.

### 1-3. 런타임

- `voxelMesher.ts`: 그룹별 **그리디 메싱**(같은 색 + 같은 AO 의 인접 면 병합), 정점색에 복셀 AO(코너 가림 0~3 → `VISUAL.voxelCharacter.aoCurve`) 를 굽는다. 기본은 면 단위 AO(`aoPerFace`): 꼭짓점별 AO 는 병합이 막혀 삼각형이 약 2배.
- `voxelParts.ts`: 부위 → 관절 노드 트리 (waist → torso/head/팔(upper→fore→device), body → pelvis/skirtF·B/sashF·B/다리(thigh→shin→foot)). 노드 위치 = 피벗 - 부모 피벗.
- `voxelPose.ts` + `protagonistPose.ts`: 걷기·공중·조준·반동·숨쉬기는 기존 `targetPose` 재사용(도면의 직립 자세에 맞춰 `VISUAL.voxelCharacter.pose` 로 일부 값 덮어쓰기), 자락은 다리 스윙을 `skirtFollow` 비율로 추종, 천 자락은 사인파(`sash`), 조준 시 도면의 팔 바깥 기울기를 상쇄.
- 재질은 `createMaterial` 경유(정점색, selfGlow·rim). 화면 복셀은 별도 메시·재질(청록 emissive, 안개 무시) + `setGlow`.
- 예산: 삼각형 ≤ 6,000, 드로우콜(메시) ≤ 20 — `src/player/voxel.test.ts` 가 검사한다 (현재 약 5,800 tri / 19 메시).

### 1-4. 알려진 한계 (72칸 해상도)

복셀 한 변 2.5cm 라 얼굴(폭 약 9칸)의 안경·눈은 어두운 가로 띠 수준, 벨트 버클·파우치 덮개·붕대 결·옷 얼룩 무늬는 뭉개진다. 톱니 자락은 평평한 단 + 색 톱니, 천 끝 찢김은 얇은 몇 칸. 해상도를 올리면(`VOXEL_HEIGHT`) 세부는 늘지만 삼각형이 해상도² 로 는다(88칸에서 약 10,000 tri).

## 2. 얼굴 텍스처 (M1h, 폴백 전용)

`?char=legacy` 폴백(로프트 메시 주인공)이 쓴다. 복셀 주인공은 쓰지 않는다 — 폴백을 삭제하기 전까지 유지한다.

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
