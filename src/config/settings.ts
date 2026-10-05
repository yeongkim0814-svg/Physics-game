// 비주얼·입력·성능 설정. 게임플레이 수치는 tuning.ts, 이쪽은 "보이고 조작되는 방식"만 다룬다.

export const VISUAL = {
  fov: 75,
  /** 내부 렌더 해상도(세로). 가로는 화면 비율로 결정 (270 → 16:9 에서 480×270). 낮출수록 거칠고 빠르다 */
  internalHeight: 270,
  minInternalHeight: 160,
  camera: { near: 0.1, far: 160 },
  /** 정점 스냅: 정점을 내부 픽셀 격자(snapPixels 배수)에 맞춰 PS1 특유의 떨림 */
  vertexSnap: true,
  snapPixels: 1,
  /** 절차 생성 텍스처 한 변 픽셀 수 (16~64) / 텍스처 1타일이 덮는 월드 길이(m) */
  textureSize: 32,
  textureTileMeters: 2,
  /** 지형 박스를 이 크기(m) 이하 조각으로 분할 (정점 스냅이 큰 폴리곤 텍스처를 흔드는 것 방지) */
  maxPolySize: 8,
  /** 후처리 5단계 (PERF.postprocess 로 전체 on/off). 강도는 여기서 튜닝 */
  post: {
    edge: 0.62, edgeLo: 0.09, edgeHi: 0.22, // 깊이 윤곽선: 어두워지는 정도 / smoothstep 임계값
    saturation: 0.75,                       // 채도 유지 비율 (낮을수록 탁함)
    contrast: 1.14,
    tint: [1.0, 0.985, 0.8] as [number, number, number], // 올리브-노랑 색조
    black: 0.2,                           // 검정 최소값 (완전한 검정 방지)
    vignette: 0.4,
    grain: 0.01,                            // 프레임마다 변하는 그레인
    grainSpeed: 12,
    scanline: 0.05,
    levels: 16,                             // 채널당 양자화 단계 (4x4 바이어 디더)
  },
  fog: { color: 0x20241a, near: 8, far: 70 },
  lighting: { ambient: 0xd0d4c0, sun: 0xfffef8, sunDir: [0.4, 0.8, 0.3] as [number, number, number] },
} as const;

export const PERF = {
  mobCap: 12,
  postprocess: true,
  showFps: false,
  /** FPS 가 낮으면 내부 해상도를 자동으로 낮춘다 */
  autoResolution: true,
  targetFps: 45,
  autoResolutionStep: 0.8,
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
    swap:     { right: 250, bottom: 40,  size: 64,  label: 'AMMO' }, // 재료 전환
  },
  buttonOpacity: 0.45,
  /** 버튼 적중 여유(px). 엄지가 버튼 가장자리를 살짝 벗어나도 눌린 것으로 본다 */
  buttonSlop: 10,
  /** 놓친 pointerup 복구 시 손가락 위치 허용 오차(px) */
  reconcileTolerance: 100,
  /**
   * 전력질주 잠금 (PUBG/Arena Breakout 방식): 조이스틱을 끝(림)까지 밀면 조이스틱 위쪽에 잠금 아이콘이 나타나고,
   * 손가락을 그 아이콘까지 끌어올리면 잠긴다. 잠기면 손잡이가 아이콘 자리에 고정되고 손을 떼도 전력질주가 유지된다.
   * 해제: 왼쪽(조이스틱) 영역을 다시 터치.
   */
  sprint: {
    // 불변식: iconDistance·반경 − (iconSize/2 + triggerSlop) > 반경 (림 끝까지 밀어도 아이콘 판정에 닿지 않아야 평소 달리기로 잠기지 않는다. touchMath.test 가 검증)
    iconDistance: 1.6, // 아이콘 위치: 조이스틱 시작점 위로 반경의 몇 배
    iconSize: 52,      // 아이콘 지름(px)
    triggerSlop: 6,    // 아이콘 가장자리에서 이만큼 안쪽으로 들어와도 잠금(px)
    vibrateMs: 25,
  },
} as const;
