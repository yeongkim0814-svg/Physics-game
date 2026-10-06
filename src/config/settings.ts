// 비주얼·입력·성능 설정. 게임플레이 수치는 tuning.ts, 이쪽은 "보이고 조작되는 방식"만 다룬다.
import { LP_DAY, LP_DUSK } from './lowpolyPresets';

export const VISUAL = {
  fov: 75,
  camera: { near: 0.1, far: 500 }, // far 는 안개 너머 원경이 보이도록 길게
  /** 로우폴리 렌더 수치. 색은 0xRRGGBB, 길이는 m */
  lowpoly: {
    /** 시간대 프리셋 (M1i). 기본 'dusk' = 영원한 황혼(목표 이미지), 'day' = 이전 BotW풍 낮(보관). URL `?tod=day|dusk` 로 덮어쓸 수 있다 */
    timeOfDay: 'dusk' as 'dusk' | 'day',
    /** 시간대별 수치 (안개·조명·하늘·지형 팔레트·캐릭터 보정·블롭·장식·기능 on/off). 활성 값은 render/style.ts 의 LP */
    presets: { day: LP_DAY, dusk: LP_DUSK },
    /**
     * 원경 백드롭(M1i): 가로로 이음새 없는 파노라마 PNG 를 카메라를 따라다니는 원통(안쪽 면)에 붙인다. 파일 하나를 같은 이름·크기로 바꾸면 교체된다
     * (다른 크기/이름이면 아래 file·width·height 만 맞춘다). 생성: scripts/make_backdrop.py → docs/BACKDROP.md.
     * 이미지 x 는 화면에서 왼→오 (안에서 바깥 볼 때), 방위 θ = atan2(dx, dz) 는 x = (1 - θ/2π)·width. 해·빛기둥 방위는 스크립트와 같은 값.
     */
    backdrop: {
      file: 'backdrop_dusk.png', width: 2048, height: 512,
      radius: 450,          // 원통 반지름 (카메라 far 500 안쪽, 지형이 앞을 가린다)
      heightScale: 1,       // 원통 높이 = 둘레 × (height/width) × 이 값 (1 = 정사각 픽셀)
      horizonV: 0.62,       // 이미지 위쪽에서 눈높이(지평선)까지의 비율 (원통 중심 보정)
      brightness: 1,        // 밝기 곱 (0~)
      sunAzimuthDeg: 143, beaconAzimuthDeg: 170, // 해 원반·성/빛기둥 방위 (θ = atan2(dx, dz), 도). 스크립트 상수와 일치
      pixelated: true,      // 확대 시 nearest (픽셀 블록 느낌). false 면 선형
    },
    /** 블록 지형 생성기 (world/blockTerrain.ts): 면당 타일 한 변 길이(m)와 상한. 타일마다 색을 흔든다 */
    terrain: {
      seed: 23,
      tile: { block: 3.2, ground: 6, far: 28, stair: 8, cliff: 9, ledge: 4, landmark: 20 },
      maxTilesPerAxis: 40,
    },
    /** 근경 빛기둥(탑 위): 얇은 평면 2장 × 층 2겹, 안개 무시·가산 발광·느린 맥동 */
    beam: { height: 440, coreWidth: 0.9, outerWidth: 3.4, pulseSpeed: 0.9, pulseAmp: 0.25, coreOpacity: 0.95, outerOpacity: 0.32, spin: 0.05 },
    /** 떠 있는 파편 (시각 전용, 충돌 없음): 큐브 InstancedMesh */
    debris: {
      count: 30, seed: 31, ring: [90, 260] as [number, number], elev: [35, 170] as [number, number],
      size: [1.2, 5] as [number, number], spin: 0.3, bobAmp: 1.4, bobSpeed: 0.22,
      /** 큰 덩어리(드문 길쭉한 부유 바위) 개수와 크기 배율 */
      big: 3, bigScale: 2,
    },
    /** 탑 창문 (청록 발광 CUES.conductor): 한 면에 놓는 열 수, 높이 간격, 창 크기 */
    windows: { columns: 3, rowGap: 4.2, firstY: 5, size: [1.0, 2.4] as [number, number], glow: 1.0, proud: 0.1 },
    /** 자동 해상도 저하의 하한 (렌더 버퍼 세로 px). 기본 해상도는 innerHeight × min(devicePixelRatio, PERF.maxPixelRatio) */
    minHeight: 360,
    /** 박스 지오메트리 정점색 (낮 프리셋·원경 박스용): 낮은 주파수 명도 노이즈 + 밑동의 먼지색 그라디언트 */
    tint: {
      segment: 8,          // 벽 한 면을 이 크기(m) 이하로 분할 (정점색 보간 해상도)
      groundSegment: 14,   // 지면 분할 크기(m)
      farSegment: 60,      // 맵 밖 평원 분할 크기(m)
      noiseAmp: 0.1, noiseScale: 0.03, seed: 17, // ±명도 / 1m 당 노이즈 주파수 / 시드
      bottomColor: 0xe0b98a, bottomBlend: 0.42, bottomHeight: 5, // 밑동 먼지색 비율 / 그 색이 번지는 높이(m)
    },
    /** 선택 외곽선 (깊이 기반 후처리, 렌더 타깃 1개 추가). 끄면 후처리 없이 곧바로 캔버스에 그린다 */
    outline: { enabled: false, color: 0x2a3550, strength: 0.4, edgeLo: 0.09, edgeHi: 0.22 },
    /** 지역 탈색(색이 정보): 월드 xz 원형 지역 안의 모든 재질 채도를 낮춘다. [x, z, 반경 m, 강도 0~1]. 최대 4개. 지금은 비어 있음 */
    desat: { regions: [] as [number, number, number, number][], softness: 0.5, landmarkBase: 0.88 },
    /** 금속 구조물(전도체)의 청록 발광 비율 (CUES.conductor × 이 값). 밝은 낮에도 전도체가 읽히게 */
    conductorGlow: 0.3,
  },
  /**
   * 주인공 모델 선택 (M1j): 'voxel' = 도면 복셀 카빙(player/voxelCharacter.ts, 기본) / 'legacy' = M1h 로프트 메시(폴백, 사용자 승인 전까지 유지).
   * URL `?char=legacy|voxel` 로 덮어쓸 수 있다 (모듈 로드 시 한 번 결정).
   */
  characterModel: 'voxel' as 'voxel' | 'legacy',
  /** 복셀 주인공 (data: src/assets/protagonist_voxels.json, 생성: scripts/carve_character.py). 자세 계산은 아래 `character` 를 재사용하고 일부만 덮어쓴다 */
  voxelCharacter: {
    /** 복셀 AO: 가림 이웃 수 0(완전 가림)..3(가림 없음) → 정점색 배율 */
    aoCurve: [0.6, 0.74, 0.88, 1] as [number, number, number, number],
    /** AO 를 면 단위(꼭짓점 평균)로 통일: 같은 색 면의 병합이 늘어 삼각형이 크게 준다. false = 꼭짓점별(부드럽지만 약 2배 삼각형) */
    aoPerFace: true,
    /** 정점색 배율 = 시간대 프리셋 character.exposure × 이 값 (도면 색은 이미 때 탄 어두운 톤이라 legacy 보다 높게). */
    exposureScale: 1.19,
    /** 도면의 직립 자세에 맞춘 기본 자세 덮어쓰기 (공통 character 값 위에 얹는다) */
    pose: { restLean: 0.03, kneeRest: 0.04, armRestOut: 0, leftElbowRest: 0.1, leftArmRest: 0.0, restArm: 0.15, weaponElbowRest: 0.25 },
    /** 조준 시 도면의 바깥 기울기를 상쇄하는 비율 (팔이 앞으로 곧게 뻗게) 과 그 보간 속도(1/s) */
    aimTiltCancel: 1, aimBlendRate: 12,
    /** 발목: 정강이 기울기를 상쇄해 발을 지면과 나란히 두는 비율 (0 = 정강이와 함께 회전) */
    footLevel: 0.8,
    /** 실험복 아랫단 앞/뒤 자락이 다리 스윙을 따라가는 비율 (앞자락은 앞으로 들린 다리, 뒷자락은 뒤로 간 다리) */
    skirtFollow: 0.45,
    /** 어깨 천 자락 살랑임: 위상 속도(rad/s) / 정지·이동 진폭(rad) / 속도 비례 뒤로 날림(rad) / 좌우 흔들림 비 / 앞뒤 자락 위상차 */
    sash: { rate: 3.2, ampIdle: 0.035, ampMove: 0.16, windBack: 0.22, sideRatio: 0.6, phaseBack: 1.7 },
    /** 장치 화면 발광 청록 (평상시 비율은 data/protagonist.ts DEVICE.idleGlow 와 같은 값을 쓴다) */
    screenColor: 0x6fe6dc,
    idleGlow: 0.6,
    /** 예산 (단위 테스트가 검사): 캐릭터 삼각형 / 드로우콜(메시) */
    budget: { triangles: 6000, drawCalls: 20 },
  },
  /** 플레이스홀더 캐릭터 절차 애니메이션 (각도 rad). 걷기 속도 기준은 TUNING.player.moveSpeed */
  character: {
    strideRate: 1.9,       // 걸음 위상 진행 (rad per m)
    legSwing: 0.6, armSwing: 0.45, // 다리/팔 스윙 최대 각
    bob: 0.035,            // 걸을 때 몸 상하 흔들림 (m)
    poseSmooth: 16,        // 자세 보간 속도 (초당 지수 감쇠)
    restArm: 1.3,          // 비조준 시 무기 든 팔(어깨+팔꿈치)이 앞으로 기운 각: 장치를 몸 앞에 든다
    aimArmBase: Math.PI / 2, // 조준 시 팔이 수평 (여기에 카메라 pitch 가 더해진다)
    airLeg: 0.55, airArm: 1.0, // 공중: 다리 벌림 / 왼팔 벌림
    fallLean: 0.25, leanVy: 12, // 낙하 시 상체 기울기 최대 각 / 그 각에 도달하는 하강 속도
    kickArm: 0.5, kickBack: 0.12, kickDecay: 14, // 반동 연출: 팔 들림(rad)/무기 뒤로(m)/복귀 속도
    // --- 주인공 모델(M1f) 추가 수치. 색·치수는 data/protagonist.ts ---
    restLean: 0.07,        // 기본 자세: 상체가 앞으로 약간 숙인 각 (rad). 일러스트는 곧은 자세에 가까움
    runLean: 0.08,         // 달릴수록 추가로 숙이는 각 (속도 비 1 기준)
    headCounter: 0.85,     // 고개가 상체 숙임을 상쇄하는 비율 (1 = 항상 정면 수평)
    headAimFollow: 0.5,    // 조준 시 고개가 카메라 pitch 를 따라가는 비율
    kneeRest: 0.1,         // 서 있을 때 무릎 굽힘 (rad). 허벅지는 절반만큼 앞으로 (발은 엉덩이 아래 유지)
    kneeWalk: 0.85,        // 걸을 때 앞으로 내딛는 다리의 무릎 굽힘 추가량
    leftElbowRest: 0.22, leftElbowSwing: 0.8, leftArmRest: 0.04, // 맨손 팔: 기본 팔꿈치 굽힘 / 앞스윙 때 추가 굽힘 비 / 기본 앞쪽 각
    weaponElbowRest: 0.95, weaponElbowAim: 0.12, // 무기 든 팔 팔꿈치: 비조준(어깨+팔꿈치=restArm) / 조준(어깨+팔꿈치=수평+pitch)
    breathRate: 2.1, breathAmp: 0.014, // 숨쉬기(idle): 각속도(rad/s) / 가슴 부피 변화 비율(상체 각도에도 0.8배 반영)
    airKnee: 0.8,          // 공중 앞다리 무릎 굽힘
    kickTorso: 0.08,       // 반동 시 상체가 젖혀지는 각
    // --- M1h(일러스트 기준 재제작): 날씬한 실사 비율 모델용 재조정 ---
    armRestOut: 0.1,       // 팔을 몸에서 살짝 벌린 각 (rad, 허리 파우치를 비켜 간다)
    /** 정점색/재질 룩 */
    look: {
      faceJitter: 0.045,   // 면마다 미세 명도 변화 (패싯 느낌) ± 비율
      seed: 11,            // 면 지터 시드
      fabricTile: 0.36,    // 천 텍스처 한 장이 덮는 길이 (m)
      fabricSize: 128,     // 천 텍스처 한 변 (px, 타일링)
    },
  },
  /** 던지는 돌 색: 무거운 쪽이 더 어둡다 */
  throwable: { light: 0xb9a58a, heavy: 0x4a3b36 },
} as const;

export const PERF = {
  mobCap: 12,
  /** 렌더 해상도 = CSS 크기 × min(devicePixelRatio, 이 값). 태블릿 성능 상한 */
  maxPixelRatio: 1.5,
  antialias: true, // MSAA (outline 후처리를 켜면 렌더 타깃에는 적용 안 됨)
  postprocess: true,
  showFps: false,
  /** FPS 가 낮으면 내부 해상도를 자동으로 낮춘다 */
  autoResolution: true,
  targetFps: 45,
  autoResolutionStep: 0.8,
} as const;

/** 개발용 디버그 플래그 */
export const DEBUG = {
  /** 돌 착지 시 콘솔에 낙하 시간/높이를 찍는다 (증거 카드 UI 전 임시 확인용) */
  logThrowables: true,
} as const;

export const UI = {
  toastMs: 2200, // 알림이 떠 있는 시간 (ms)
  /** 화면 중앙 조준점 (3인칭 조준선이 가리키는 곳) */
  crosshair: { size: 18, thickness: 2, gap: 4, color: '#f2e3b8', outline: '#1a1640' },
} as const;

export const TOUCH = {
  /** 화면 왼쪽 이 비율 영역이 조이스틱, 나머지는 시점 드래그 */
  moveZoneWidth: 0.4,
  joystick: { radius: 64, deadzone: 0.12, knobSize: 56 },
  /** 터치 드래그 1px 이 마우스 몇 px 에 해당하는가 (시점 감도) */
  lookSensitivity: 1.8,
  /** 버튼 위치는 화면 오른쪽/아래 가장자리에서의 px 거리 */
  buttons: {
    fire:     { right: 28,  bottom: 40,  size: 104, label: 'FIRE' },
    jump:     { right: 150, bottom: 120, size: 84,  label: 'JUMP' },
    throw:    { right: 250, bottom: 40,  size: 64,  label: 'THROW' },  // 가벼운 돌 던지기
    throw2:   { right: 330, bottom: 40,  size: 64,  label: 'THROW2' }, // 무거운 돌 던지기
    weapon:   { right: 250, bottom: 120, size: 64,  label: 'WPN' },  // 장착한 무기 전환
  },
  buttonOpacity: 0.45,
  /** 버튼 적중 여유(px). 엄지가 버튼 가장자리를 살짝 벗어나도 눌린 것으로 본다 */
  buttonSlop: 10,
  /** 놓친 pointerup 복구 시 손가락 위치 허용 오차(px) */
  reconcileTolerance: 100,
  /**
   * 전력질주: 조이스틱 y(시작점 기준 위쪽 변위, 반경 대비)가 start 이상이면 전력질주한다(손가락을 내리면 해제).
   * 전력질주 중 y 가 auto 이상까지 올라갔다가 손을 떼면 자동 전력질주로 이어진다 (auto > 1 이면 림 밖까지 끌어야 함).
   * 자동 전력질주 중 왼쪽(조이스틱) 영역을 다시 터치하면 취소되고 그 터치의 조작을 따른다.
   */
  sprint: {
    start: 0.85,      // 이 값 이상이면 전력질주 (반경 대비). 이보다 약하게 밀면 걷기(아날로그)
    auto: 1.35,       // 이 값 이상에서 손을 떼면 자동 전력질주
    hysteresis: 0.05, // 경계 떨림 방지
    hintSize: 44,     // 자동 전력질주 목표 표시 지름(px)
    vibrateMs: 25,    // 자동 전력질주 대기 진입 시 진동
  },
} as const;
