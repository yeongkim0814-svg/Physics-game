// 비주얼·입력·성능 설정. 게임플레이 수치는 tuning.ts, 이쪽은 "보이고 조작되는 방식"만 다룬다.

export const VISUAL = {
  /**
   * 비주얼 프리셋 (2026-10-06 변경). 'lowpoly' = BotW 풍 밝고 선명한 색감의 로우폴리(기본, 네이티브 해상도·플랫 셰이딩·낮 하늘),
   * 'ps1' = 이전 PS1풍(저해상도 타깃·정점 스냅·디더·석양, 롤백/비교용). 개발 중에는 URL `?style=ps1|lowpoly` 로 덮어쓸 수 있다.
   * 아래 `lowpoly` 블록은 'lowpoly' 전용, 그 외 fog/lighting/sky/post/internalHeight/vertexSnap/texture* 는 'ps1' 전용 수치다.
   */
  style: 'lowpoly' as 'lowpoly' | 'ps1',
  fov: 75,
  /** 내부 렌더 해상도(세로). 가로는 화면 비율로 결정 (270 → 16:9 에서 480×270). 낮출수록 거칠고 빠르다 */
  internalHeight: 270,
  minInternalHeight: 160,
  camera: { near: 0.1, far: 500 }, // far 는 안개 너머 원경 랜드마크·달이 보이도록 길게
  /** 정점 스냅: 정점을 내부 픽셀 격자(snapPixels 배수)에 맞춰 PS1 특유의 떨림 */
  vertexSnap: true,
  snapPixels: 1,
  /** 절차 생성 텍스처 한 변 픽셀 수 (16~64). 벽돌/타일 패턴이 읽히는 최소 해상도는 64 / 텍스처 1타일이 덮는 월드 길이(m) */
  textureSize: 64,
  textureTileMeters: 2,
  /** 지형 박스를 이 크기(m) 이하 조각으로 분할 (정점 스냅이 큰 폴리곤 텍스처를 흔드는 것 방지) */
  maxPolySize: 8,
  /** 후처리 5단계 (PERF.postprocess 로 전체 on/off). 강도는 여기서 튜닝 */
  post: {
    edge: 0.62, edgeLo: 0.09, edgeHi: 0.22, // 깊이 윤곽선: 어두워지는 정도 / smoothstep 임계값
    saturation: 1.05,                       // 채도 유지 비율 (1 이상 = 선명). 색이 정보이므로 높게
    contrast: 1.15,
    tint: [1.0, 0.97, 0.92] as [number, number, number], // 약한 따뜻한 석양 색조
    black: 0.1,                           // 검정 최소값 (완전한 검정 방지)
    vignette: 0.3,
    grain: 0.01,                            // 프레임마다 변하는 그레인
    grainSpeed: 12,
    scanline: 0.05,
    levels: 16,                             // 채널당 양자화 단계 (4x4 바이어 디더)
  },
  /** 지평선 호박빛 = 안개색 = 배경색(하늘 돔은 지평선 색과 이 색을 맞춘다). 멀리 갈수록 이 색에 잠긴다 */
  fog: { color: 0xd9946a, near: 30, far: 150 },
  /** 절차 하늘(render/textures.ts skyTexture): 돔 반지름은 카메라 far 안쪽, 깊이 무시로 항상 맨 뒤에 그린다 */
  sky: {
    radius: 400, texWidth: 512, texHeight: 256,
    gradientPower: 0.62,     // 지평선→천정 색 분포 (작을수록 호박/노을 띠가 두꺼움)
    glowPower: 3, glowAmount: 0.55, // 태양 방위의 노을 번짐: cos^power, 최대로 끌어올리는 비율
    starCount: 110, starMinElev: 0.25, starMaxSin: 0.96, // 별 개수 / 최소 고도(rad) / 최대 고도의 sin (천정 바로 위 늘어남 방지)
    cloudCount: 8, cloudRows: 3, cloudWidth: 90, cloudBandLo: 0.12, cloudBandHi: 0.42, // 구름 개수/폭(px)/고도 범위(0~1)
  },
  /** 차가운 보랏빛 환경광(그늘) 대 따뜻한 호박빛 태양(양지) 대비. 태양은 낮게 깔려 벽면마다 명암이 갈린다 */
  lighting: {
    ambient: 0x7488ee, ambientGround: 0x6c5268, ambientIntensity: 1.9, // 위쪽 면=차가운 하늘색, 아래쪽 면=따뜻한 바닥 반사
    sun: 0xffa24a, sunIntensity: 3.5, sunDir: [0.8, 0.3, 0.45] as [number, number, number], sunDistance: 40,
  },
  /** 'lowpoly' 프리셋 전용 (BotW 풍 밝은 낮 + 대기 원근). 색은 0xRRGGBB, 길이는 m */
  lowpoly: {
    /** 자동 해상도 저하의 하한 (렌더 버퍼 세로 px). 기본 해상도는 innerHeight × min(devicePixelRatio, PERF.maxPixelRatio) */
    minHeight: 360,
    /** 안개 = 배경 = 하늘 지평선 색. near~far 에서 청백색으로 서서히 사라진다 (카메라 far 500 안쪽) */
    fog: { color: 0xcfe7f5, near: 40, far: 400 },
    /** 따뜻한 태양광(Directional) + 하늘색/청회색 반사광(Hemisphere). 햇빛 면=크림, 그늘 면=청회색. 강도는 three 물리 단위(≈π 배) */
    lighting: {
      sky: 0x93bcff, ground: 0xa0b0e6, hemiIntensity: 2.3,
      sun: 0xfff1d2, sunIntensity: 2.6, sunDir: [0.45, 0.7, 0.55] as [number, number, number], sunDistance: 40,
    },
    /** 낮 하늘 돔: 정점 색 그라디언트(천정 청색 → 중간 → 지평선 옅은 하늘색/크림) + 해 + 로우폴리 구름 */
    sky: {
      radius: 400, rings: 32, segments: 24,
      zenith: 0x2f7fe4, mid: 0x74b8f4, horizon: 0xcfe7f5,
      gradientPower: 0.75,   // 지평선→천정 분포 지수 (작을수록 옅은 띠가 두꺼움)
      sun: { distance: 380, radius: 18, color: 0xfffbe6, haloColor: 0xffffff, haloScales: [1.7, 2.6, 3.8] as number[], haloOpacity: 0.18 }, // 후광: 반경 배수별 반투명 원을 겹쳐 단계적으로 흐려진다
      clouds: {
        count: 9, parts: [3, 5] as [number, number], distance: 300, size: [26, 48] as [number, number],
        squash: 0.4, elevMin: 0.2, elevMax: 0.62, // 고도(rad)
        color: 0xffffff, shade: 0x4a5878, drift: 0.004, // shade = 그늘 면이 너무 어두워지지 않게 더하는 자체 발광색
                    // 구름 무리가 천천히 도는 속도 (rad/s)
      },
    },
    /** 박스 지오메트리 정점색 (텍스처 대신): 낮은 주파수 명도 노이즈 + 밑동의 먼지색 그라디언트 */
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
    /** 지면 장식 (시각 전용, 충돌 없음): 맵 밖 평원의 나무·바위·언덕 + 맵 안 이끼 패치 + 협곡 바닥 청록 잔물 */
    decor: {
      seed: 5, trees: 150, rocks: 60, hills: 16, mossPatches: 70, puddles: 12,
      treeRange: [92, 460] as [number, number], // 맵 중심 기준 체비셰프 거리
      hillRange: [150, 470] as [number, number],
      mossColor: 0x8bb36a, mossColor2: 0xa9bb62, puddleColor: 0x46a89a,
      treeCrown: 0x6fa860, treeCrown2: 0x93b255, treeTrunk: 0x8a6244,
      rock: 0xc9b9a2, hill: 0xd2b27c, hill2: 0xb7b08a,
    },
    /** 발밑 블롭 그림자 (3인칭 가독성) */
    blob: { radius: 0.5, opacity: 0.32, color: 0x24324d, maxDrop: 40, minScale: 0.45, fadeHeight: 12 },
    /** 금속 구조물(전도체)의 청록 발광 비율 (CUES.conductor × 이 값). 밝은 낮에도 전도체가 읽히게 */
    conductorGlow: 0.3,
    /** 주인공 자체 발광: 밝은 낮빛에서는 거의 필요 없다 (ps1 은 data/protagonist.ts 의 GLOW_PS1) */
    characterGlow: { shirt: 0.08, skin: 0.06, slacks: 0.07 },
  },
  /** 플레이스홀더 캐릭터 절차 애니메이션 (각도 rad). 걷기 속도 기준은 TUNING.player.moveSpeed */
  character: {
    strideRate: 1.9,       // 걸음 위상 진행 (rad per m)
    legSwing: 0.75, armSwing: 0.5, // 다리/팔 스윙 최대 각
    bob: 0.035,            // 걸을 때 몸 상하 흔들림 (m)
    poseSmooth: 16,        // 자세 보간 속도 (초당 지수 감쇠)
    restArm: 0.9,          // 비조준 시 무기 든 팔이 앞으로 기운 각
    aimArmBase: Math.PI / 2, // 조준 시 팔이 수평 (여기에 카메라 pitch 가 더해진다)
    airLeg: 0.55, airArm: 1.0, // 공중: 다리 벌림 / 왼팔 벌림
    fallLean: 0.25, leanVy: 12, // 낙하 시 상체 기울기 최대 각 / 그 각에 도달하는 하강 속도
    kickArm: 0.5, kickBack: 0.12, kickDecay: 14, // 반동 연출: 팔 들림(rad)/무기 뒤로(m)/복귀 속도
    // --- 주인공 모델(M1f) 추가 수치. 색·치수는 data/protagonist.ts ---
    restLean: 0.2,         // 기본 구부정 자세: 상체가 앞으로 숙인 각 (rad)
    runLean: 0.1,          // 달릴수록 추가로 숙이는 각 (속도 비 1 기준)
    headCounter: 0.85,     // 고개가 상체 숙임을 상쇄하는 비율 (1 = 항상 정면 수평)
    headAimFollow: 0.5,    // 조준 시 고개가 카메라 pitch 를 따라가는 비율
    kneeRest: 0.4,         // 서 있을 때 무릎 굽힘 (rad). 허벅지는 절반만큼 앞으로 (발은 엉덩이 아래 유지)
    kneeWalk: 0.75,        // 걸을 때 앞으로 내딛는 다리의 무릎 굽힘 추가량
    leftElbowRest: 0.35, leftElbowSwing: 0.8, leftArmRest: 0.06, // 맨손 팔: 기본 팔꿈치 굽힘 / 앞스윙 때 추가 굽힘 비 / 기본 앞쪽 각
    weaponElbowRest: 0.55, weaponElbowAim: 0.15, // 무기 든 팔 팔꿈치: 비조준(어깨+팔꿈치=restArm) / 조준(어깨+팔꿈치=수평+pitch)
    breathRate: 2.1, breathAmp: 0.014, // 숨쉬기(idle): 각속도(rad/s) / 가슴 부피 변화 비율(상체 각도에도 0.8배 반영)
    airKnee: 0.8,          // 공중 앞다리 무릎 굽힘
    kickTorso: 0.08,       // 반동 시 상체가 젖혀지는 각
  },
  /** 던지는 돌 색: 무거운 쪽이 더 어둡다 */
  throwable: { light: 0xb9a58a, heavy: 0x4a3b36 },
} as const;

export const PERF = {
  mobCap: 12,
  /** 'lowpoly' 전용: 렌더 해상도 = CSS 크기 × min(devicePixelRatio, 이 값). 태블릿 성능 상한 */
  maxPixelRatio: 1.5,
  antialias: true, // 'lowpoly' 전용 MSAA (outline 후처리를 켜면 렌더 타깃에는 적용 안 됨)
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
