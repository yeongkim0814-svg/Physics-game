// 비주얼·입력·성능 설정. 게임플레이 수치는 tuning.ts, 이쪽은 "보이고 조작되는 방식"만 다룬다.

export const VISUAL = {
  fov: 75,
  /** 내부 렌더 해상도(세로). 가로는 화면 비율로 결정 (270 → 16:9 에서 480×270). 낮출수록 거칠고 빠르다 */
  internalHeight: 270,
  minInternalHeight: 160,
  camera: { near: 0.1, far: 120 },
  /** 정점 스냅: 정점을 내부 픽셀 격자(snapPixels 배수)에 맞춰 PS1 특유의 떨림 */
  vertexSnap: true,
  snapPixels: 1,
  /** 절차 생성 텍스처 한 변 픽셀 수 (16~64) / 텍스처 1타일이 덮는 월드 길이(m) */
  textureSize: 32,
  textureTileMeters: 2,
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
    interact: { right: 150, bottom: 24,  size: 72,  label: 'USE' },
    swap:     { right: 250, bottom: 40,  size: 64,  label: 'AMMO' }, // 재료 전환
  },
  buttonOpacity: 0.45,
} as const;
