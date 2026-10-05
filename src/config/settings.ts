// 비주얼·입력·성능 설정. 게임플레이 수치는 tuning.ts, 이쪽은 "보이고 조작되는 방식"만 다룬다.

/** 가독성 단서 색 (어두운 안개 속에서도 구분되어야 하는 것들). emissive 로 안개에 묻히지 않게 쓴다 */
export const CUES = {
  enemy: 0xff4a2e,
  metal: 0x5cc8ff,      // 금속 전도체
  water: 0x2f7dff,      // 물웅덩이
  electric: 0xe8f8ff,   // 전기 연쇄 (가장 밝게)
  exit: 0x4dff88,       // 탈출 지점
  hazard: 0xffd23c,     // 위험 구역
} as const;

export const VISUAL = {
  fov: 75,
  /** 내부 렌더 해상도(가로). 세로는 화면 비율로 결정. 낮출수록 거칠고 빠르다 */
  internalWidth: 400,
  minInternalWidth: 240,
  /** 정점 스냅: true 면 정점을 내부 픽셀 격자(snapPixels 배수)에 맞춰 떨림 효과 */
  vertexSnap: true,
  snapPixels: 1,
  /** 어파인 텍스처 왜곡(큰 면이 가까울 때 텍스처가 휘어 보임) */
  affineTexture: true,
  /** 절차 생성 텍스처 한 변 픽셀 수 (16~64) */
  textureSize: 32,
  /** 텍스처 1타일이 덮는 월드 길이(m) */
  textureTileMeters: 2,
  /** 후처리: 색 양자화 + 디더 + 노이즈. PERF.postprocess 로 끌 수 있음 */
  colorLevels: 32,      // 채널당 단계 (32 = PS1 15bit)
  ditherStrength: 1,
  noiseStrength: 0.045,
  fog: { color: 0x161d22, near: 6, far: 70 },
  lighting: {
    ambient: 0x8a949c,
    sun: 0xd0d8e0,
    sunDir: [0.4, 0.8, 0.3] as [number, number, number],
  },
} as const;

export const PERF = {
  /** 캔버스 해상도 배율 상한 (내부 해상도와 별개로 최종 확대 패스에 적용) */
  pixelRatioCap: 1,
  mobCap: 12,
  postprocess: true,
  showFps: false,
  /** FPS 가 낮으면 내부 해상도를 자동으로 낮춘다 */
  autoResolution: true,
  targetFps: 45,
  autoResolutionStep: 0.85,
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
  },
  buttonOpacity: 0.45,
} as const;
