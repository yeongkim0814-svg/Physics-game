# 지형 (A2: 계단형 하이트필드 + 셰이더 높이 안개)

`OPEN_WORLD_ART_DIRECTION.md` §24 Phase 2 구현 설명. (PS1 프리셋은 삭제됨).

## 구도

```
        먼 산맥(r 240~520, 릿지 노이즈)   ← 백드롭 성·고리·하늘
     중거리 메사·고립 암주(계곡에서 솟음)
   깊은 계곡 바닥(-27 / -36m 선반, 보랏빛 높이 안개 속)
  고원 가장자리 계단 절벽(9m 선반 × 3m 층)
 ┌──────────────────────────────┐
 │ 플레이 고원 y=0 (반폭 82m)   │ ← 외곽 충돌 벽(반폭 80.5m) 바로 뒤에서 절벽이 시작
 │ 협곡(z∈[-18,-4], 깊이 14m)   │   협곡은 고원 바깥으로 입을 벌린다
 └──────────────────────────────┘
```

플레이 영역(고원)은 기존 게임플레이 구조(탑·계단·다리 잔해·폐허 박스·테라스·스폰 평지) 그대로이고, 하이트필드는 그 아래 바닥(협곡 포함)을 대체하며 **고원 바깥**을 계곡·메사·산맥으로 채운다. 고원 안에서 지형이 가두거나 떨어뜨릴 곳이 없다: 낮은 곳은 협곡(양 끝 계단)뿐이고, 계곡은 외곽 충돌 벽 너머다.

## 알고리즘 (`src/world/terrain/`)

| 파일 | 역할 |
|---|---|
| `noise.ts` | 그라디언트 노이즈, fBm, 릿지 fBm, 도메인 워프 (시드 결정적) |
| `terrainField.ts` | `TerrainField`: `continuous(x,z)` → 양자화 `height(x,z)` 순수 함수 + 2단 LOD 격자(`near`/`far`) + `surface(x,z)`(렌더·충돌과 같은 칸 단위 높이 질의) |
| `terrainMesh.ts` | 격자 → 윗면 그리디 병합 + 수직 절벽 벽 → 렌더 메시(`facet.ts` 삼각 패싯: 불규칙 삼각형·절벽 안쪽 패임, 걸을 수 있는 윗면은 평평) / 충돌 메시(합친 사각형, 변경 없음) |
| `reachability.ts` | 표면 높이 격자 + flood-fill 도달성 검사 (테스트·튜닝용 순수 함수) |
| `terrain.test.ts` | 결정성·정확한 고원/협곡/패드·램프 경사·도달성(양성+음성 대조군)·충돌 메시 상한·벽 일치 |

### 높이 함수 `continuous(x,z)` (층 단위 양자화 전)

1. **고원**: 반폭 `plateau.half`(82m) 안은 정확히 0. 바깥은 `wobble`(14m) 만큼 구불거리는 경계(바깥으로만)에서의 거리 `d` 로 시작.
2. **림 → 계곡**: `d / rimWidth`(14~46m, 노이즈) 를 smoothstep 해 0 → 계곡 바닥(깊이 24~40m, 중간 주파수 기복 ±4m)으로 떨어뜨린다.
3. **메사/암주**: `MAP.terrain.massifs` 각각이 워프된 거리 `q` 로 계곡 바닥 → `top` 을 `smoothstep((1-q)/sharp)` 로 솟는다 (sharp 0.18~0.5 = 깎아지른~완만).
4. **먼 산맥**: `r0`~`r1` 에서 솟는 릿지 노이즈. 성(비컨) 방위 근처는 `dip.min` 배로 낮춰 백드롭을 가리지 않는다.
5. **층 선반**(`tier`): 높이를 9m 간격 평평한 선반으로 끌어당긴다(`sharp` 지수) → 평평한 단 + 가파른 절벽. 고원 안쪽은 영향 없음.
6. **둔덕**(`MAP.terrain.bluffs`), **평탄 패드**(`pads`: 중심~radius 는 정확히 `pad.y`, blend 로 이어짐).

그 위에서 `height()` 가 **층 높이(`stepH` 3m)로 양자화**하고, 이어서 **램프 회랑**(fineStep 0.2m 단위 선형, 일반 지형보다 우선), **협곡 카빙**(`min(h, -depth)`, 고원 바깥 30m 까지 기울기 0.5로 입을 벌림)을 적용한다. 협곡 벽은 칸 경계(짝수 m)에 정확히 놓인다. 모든 높이는 `fineStep`(0.2m)의 정수배(Int16 격자).

### LOD (C5, 청크 스트리밍 없음)

- **근거리**: 반폭 120m, 셀 2m (플레이 고원 + 가장자리 절벽).
- **원거리 링**: 반폭 528m 정사각 중 반경 520m(카메라 far 500 너머는 비움) 원, 셀 24m, 층 높이 9m(`farStepH`), 근거리 영역은 비움.
- 경계 균열 방지: 벽은 "높은 쪽 칸이 낮은 쪽을 향해" 그린다. 이웃 높이는 항상 `field.levelAt`(LOD 인지)으로 조회하고, 원거리 칸이 고해상도 이웃을 보면 변을 nearCell 단위로 쪼개 본다 → LOD 경계도 같은 규칙.
- 청크화하기 쉽게 `height(x,z)`(순수), `sampleGrid`(영역별), `collectQuads(field, win, includeFar)`(영역별 메시 빌드)가 분리돼 있다.

### 메시와 색

- 윗면: 같은 높이 칸을 그리디로 큰 사각형으로 합친 뒤 **타일**(`TERRAIN_MESH.tile`)로 쪼개 `blockTerrain.tileColor`(명도·색조 지터, 윗면 이끼) 재사용. 타일 크기는 원점 반경 `r0`(100m) 이내는 `top` 3.5m / `wall` 8m, 바깥은 `(r/r0)^3` 배로 커져 `max` 48m 에서 멈춘다 (삼각형 예산).
- 벽: 같은 평면·같은 높이 구간의 이어진 조각을 하나로 합치고, 정점별 밑동 그늘(`sideShade`)로 층리 줄무늬. 보이지 않는 아래면은 만들지 않는다.
- 색 보정(`presets.*.terrain.depthTint/farTint`): 낮은 곳일수록 어둡고 보랏빛, 벽 명도 배율(`wall`), 먼 링은 원경 산 색(`farTint`)으로 수렴.
- 지형 메시는 블록 모자이크(폐허·계단·테라스·협곡 돌출)와 **한 메시·한 재질(1 드로우콜)** 로 합친다.

### 충돌

`buildCollisionMesh(field, 86)`: 외곽 벽 안쪽(+여유)만 합친 사각형 그대로 정적 trimesh (`core/physics.addStaticTrimesh`). 원거리 링은 시각 전용. 삼각형 상한 `TERRAIN_COLLISION.maxTriangles`(4000) 는 단위 테스트가 검사. `FIX_INTERNAL_EDGES` 플래그는 쓰지 않는다 (아래 '알려진 한계').

### 도달성

`reachability.ts`: 표면 높이 = `max(하이트필드, 박스 윗면)` 격자(0.4m, 표본을 칸 중심에서 0.07m 비껴 박스 모서리와의 부동소수 일치를 피함)에서 스폰부터 flood-fill, 인접 칸 높이 차 ≤ `TUNING.player.stepHeight`(0.5m). 테스트가 검증: 스폰·폐허·협곡 계단·협곡 바닥·북쪽 지면·**다리 잔해 양끝**·탑 첫 계단·**탑 지붕**·**쌍둥이 낙하 패드**·**램프로 오르는 둔덕 윗면**이 같은 연결 성분, 램프가 없으면 둔덕이, 협곡 계단이 없으면 북쪽·탑이 끊김(음성 대조군), 스폰 성분의 최저 높이는 협곡 바닥(-14m). 층 단차(3m)는 막히고 램프(칸당 ≤0.4m)·계단(0.4m)만 통과한다.

## 셰이더 높이 안개 (C6)

`render/materials.ts` 공용 패치(`createMaterial`)에서 three 의 `fog_fragment` 를 교체: 거리 안개 위에 `ρ(y)=density·exp(-(y-top)/falloff)` 를 카메라→프래그먼트 선분으로 해석 적분(`1-exp(-τ)`)해 `fog.height.color` 로 섞는다. 지형·장식·캐릭터·파편·탑 모두 월드 y 로 같은 안개를 받고, 하늘·백드롭·빛기둥(`fog:false`)은 제외. 계곡 위에서 내려다볼수록 짙은 보라, 고원(y≥0)은 선명. 프리셋 `presets.dusk.fog.height = { top:-12, falloff:9, density:0.014, color:0x424a7c }`, `day` 는 옅은 안전 기본값, `ps1` 은 패치 미적용. 옛 `atmosphere.ts` 의 협곡 안개 면 4장 근사(`features.haze`/`presets.*.haze`)는 **제거**했다.

## 튜닝 방법

| 바꾸고 싶은 것 | 어디 |
|---|---|
| 층 높이(절벽 거칠기·삼각형), 선반 간격 | `TERRAIN_FIELD.stepH`(1.6~3m), `tier.height`(stepH 의 배수 권장: 협곡 14m·고원 0m 는 데이터가 정확히 지정) |
| 계곡 깊이·폭, 림 경사 | `valley.depthMin/Max`, `rim.widthMin/Max`, `plateau.wobble` |
| 메사·암주 배치/높이(top 은 tier.height 의 배수) | `data/map.ts` `TERRAIN_MASSIFS` |
| 산맥 높이·시작 거리·성 방위 낮춤 | `mountain.*`, `mountain.dip` |
| 플레이 영역 보호(평탄 패드)·둔덕·램프 | `data/map.ts` `TERRAIN_PADS/BLUFFS/RAMPS` (테스트가 겹침·경사·도달성 검사) |
| LOD 셀·범위 | `lod.nearHalf/nearCell/farCell/farRadius` (nearHalf 는 farCell 의 배수) |
| 모자이크 거칠기·삼각형 | `TERRAIN_MESH.tile`, `maxTiles` |
| 삼각 패싯(흔들림·패임·기복·분할 임계·적용 반경) | `VISUAL.lowpoly.terrain.facet` (`world/facet.ts`). 렌더 삼각형 ≈26.7k (패싯 전 22.1k) |
| 안개 깊이·색 | `presets.*.fog.height` (top/falloff/density/color), `terrain.depthTint/farTint` |

예산(태블릿): 프레임당 드로우콜 ≤ 80, 삼각형 ≤ 45k. 현재 ≈ 30콜 / 41~42k (지형 렌더 ≈ 19k, 충돌 trimesh ≈ 630). 초과하면 `tile.max/r0/wall`, `lod.farCell`, 메사 수 순으로 줄인다.

## 알려진 한계

- 고원 안은 평평하다(경관은 가장자리·바깥에서 나온다). 둔덕 3개와 램프 2개가 유일한 고도 변화.
- 절벽 높이는 계단형 양자화지만 면은 삼각 패싯으로 패이고 흔들린다(걸을 수 있는 윗면·충돌은 그대로 평평/수직). 남은 것: (목표 이미지의 자잘한 픽셀 모자이크·아치·폭포·건축물은 Phase 4·5).
- 근거리 격자 밖(반경 120m)은 셀 24m 라 메사 윤곽이 거칠다.
- trimesh 에 `FIX_INTERNAL_EDGES` 를 켜면 둔덕 모서리(0.2m 단차 윗면 가장자리)에서 캐릭터 컨트롤러 `computedGrounded` 가 false 로 나와 자동 계단이 실패한다(실측). 대신 병합된 큰 사각형이라 내부 모서리가 적고, 걷기·돌 낙하·카메라 시험은 모두 통과했다.
- 도달성 검사는 2.5D(표면 하나)라 다리 상판 아래 통로 같은 겹침은 표현하지 못한다(상판 아래 협곡 바닥은 상판이 없는 틈으로 이어짐).
