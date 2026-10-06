/**
 * 주인공 외형 사양 (GAME_DESIGN 14-2, M1h: 사용자 제공 캐릭터 시트 기준 재제작).
 * 치수(m)·색·관절·단면(링) 사양을 데이터로 두고 player/protagonistMesh.ts 가 이것을 읽어 로우폴리 메시로 조립한다.
 * 원점 = 발바닥 중앙, 정면 = -z, 캐릭터의 오른쪽 = +x. 좌표는 각 그룹(관절) 로컬.
 *
 * 형태 표현: 파츠는 "링(단면)을 위로 쌓은 로프트"(loft) 와 박스로 정의한다. 링 하나 = 그 높이의 타원 단면(rx, rz, 중심 cx/cz)이고
 * 링 사이 띠(band)는 아래 링의 색 `c` 로 칠해진다. `ao` 는 정점색에 굽는 가짜 앰비언트 오클루전(관절 접힘·벨트 아래 등 어둡게).
 */

export type V3 = readonly [number, number, number];

/** 색: 사용자 제공 일러스트의 COLOR PALETTE / 본체 샘플링 값 기준 (알베도). 조명에서 날아가지 않게 렌더 쪽에서 exposure 로 한 번 더 보정한다 */
export const PCOL = {
  skin: 0xddbb99,        // 피부 (베이지~크림) — 팔레트 칩 #D9B694~#DDBF9E
  skinShade: 0xb98f6c,   // 코 그늘·목 그늘·귀 안쪽
  shirt: 0xe6dacb,       // 셔츠 (크림) — 팔레트 칩 #E8E0D4, 본체 라이트 면 샘플 #DFD2C1
  shirtDark: 0xc4b6a6,   // 셔츠 접힘·칼라 그늘·소매 안쪽
  slacks: 0x7d726b,      // 바지 (회색/모래) — 팔레트 칩 #7A736C, 본체 샘플 #7C6F6B
  slacksDark: 0x5f5651,  // 바지 주머니·접힘
  hair: 0x2b2730,        // 머리 (거의 검정, 약한 남보라)
  hairLight: 0x3d3841,   // 윗머리 빛 받는 면
  frame: 0x2a2527,       // 안경테 (검정)
  belt: 0x3f3638,        // 벨트·파우치 (검은 회갈)
  beltLight: 0x5d4f4a,   // 파우치 덮개
  buckle: 0x8d8174,      // 버클 (회갈 금속)
  boot: 0x54443b,        // 부츠 (갈색)
  bootDark: 0x2f2826,    // 밑창
  band: 0x25232a,        // 손목 장비 (검정)
  device: 0x24232b,      // 휴대 장치 본체
  deviceScreen: 0x0d0e14, // 장치 화면
  cyan: 0x6fe6dc,        // 장치 청록 발광 표시
} as const;

/** 관절 위치 (부모 그룹 기준, m) */
export const JOINTS = {
  hipY: 0.93,              // 몸통·다리 피벗 높이 (root 기준)
  hipX: 0.095,             // 좌우 다리 x
  thighLen: 0.45,          // 허벅지(고관절→무릎) — 발 접지 계산용
  shinLen: 0.48,           // 정강이(무릎→발바닥)
  kneeY: -0.45,            // 무릎 (다리 그룹 기준)
  chestPivotY: 0.25,       // 가슴(숨쉬기) 피벗 (몸통 그룹 기준)
  shoulderX: 0.196, shoulderY: 0.485, // 어깨 (몸통 그룹 기준)
  elbowY: -0.3,            // 팔꿈치 (팔 그룹 기준)
  wristY: -0.3,            // 손(쥔 주먹 중심) = 휴대 장치 부착부 (팔뚝 그룹 기준)
  neckY: 0.595,            // 머리 피벗 = 턱 바로 아래 (몸통 그룹 기준)
} as const;

export interface RingSpec {
  /** 높이 (그룹 로컬). 로프트 축 방향 */
  y: number;
  rx: number; rz: number;
  cx?: number; cz?: number;
  /** 이 링 위의 띠(band) 색 */
  c: number;
  /** 정점색 AO 배율 0..1 (기본 1) */
  ao?: number;
  /** 앞(-z) / 옆(±x) / 뒤(+z) 정점만 y 를 더 올린다 (머리카락 경계선·옆머리 길이) */
  dyF?: number; dyS?: number; dyB?: number;
}

export type Channel = 'cloth' | 'plain';

export interface LoftSpec {
  name: string;
  /** 단면 각 수 (6~8 몸/팔다리, 12 머리) */
  sides: number;
  /** 첫 정점 각도(°). 앞면이 평평하려면 180/sides */
  offsetDeg: number;
  rings: readonly RingSpec[];
  capBottom?: boolean; capTop?: boolean;
  /** 안쪽(몸 중심 쪽) 면을 어둡게 하는 양 0..1: 겨드랑이·허벅지 안쪽 AO. inner = -x 쪽 (오른쪽 기준 로컬, 왼쪽은 미러) */
  innerAO?: number;
  channel: Channel;
  /** 축을 눕힌다 (발: 로프트 y 축 → 월드 -z). rotX 만 지원 */
  rotX?: number;
  pos?: V3;
  /** 오른쪽/왼쪽 한쪽에만 */
  onlySide?: 1 | -1;
  /** 로프트 회전 z (귀 기울임, rad) — 미러되는 쪽은 부호가 뒤집힌다 */
  rotZ?: number;
  /** 같은 사양을 반대쪽(x 부호 반전)에도 만든다 (몸통/머리의 좌우 파츠) */
  mirror?: boolean;
  /** 띠 재질 명도에 더하는 면 지터 진폭 (기본 VISUAL.character.look.faceJitter) */
  jitter?: number;
}

export interface BoxSpec {
  name: string;
  size: V3; pos: V3; color: number;
  rot?: V3;
  /** [아래 면, 위 면] 정점 AO 배율 */
  ao?: readonly [number, number];
  channel: Channel;
  mirror?: boolean;
  onlySide?: 1 | -1;
  /** 위 면을 이만큼 축소 (테이퍼, 1 = 직육면체) */
  taperTop?: number;
}

export interface GroupSpec { lofts: readonly LoftSpec[]; boxes: readonly BoxSpec[] }

const C = PCOL;
const OCT = 22.5; // 8각: 앞면이 평평
const HEX = 30;   // 6각

// ───────────────────────── 몸통 (엉덩이~허리, 피벗 = 엉덩이) ─────────────────────────
export const TORSO: GroupSpec = {
  lofts: [{
    name: 'torso', sides: 8, offsetDeg: OCT, channel: 'cloth', capBottom: true, capTop: false,
    rings: [
      { y: -0.11, rx: 0.172, rz: 0.108, c: C.slacks, ao: 0.78 },        // 가랑이 (허벅지에 가려짐)
      { y: -0.02, rx: 0.18, rz: 0.113, c: C.slacks, ao: 0.92 },         // 바지 허리
      { y: 0.035, rx: 0.19, rz: 0.125, c: C.belt, ao: 0.82 },           // 벨트 아래 (그림자)
      { y: 0.115, rx: 0.178, rz: 0.114, c: C.shirt, ao: 0.82 },         // 벨트 위 / 셔츠 밑단이 들어감
      { y: 0.25, rx: 0.186, rz: 0.116, c: C.shirt, ao: 1 },
    ],
  }],
  boxes: [
    // 버클 (앞 중앙) + 버클 안쪽 홈
    { name: 'buckle', size: [0.052, 0.05, 0.014], pos: [0, 0.075, -0.121], color: C.buckle, channel: 'plain', ao: [0.8, 1] },
    { name: 'buckleHole', size: [0.03, 0.028, 0.016], pos: [0, 0.075, -0.1215], color: C.belt, channel: 'plain' },
    // 바지 앞 지퍼선 / 뒷주머니 두 개
    { name: 'fly', size: [0.006, 0.07, 0.008], pos: [0, -0.01, -0.1035], color: C.slacksDark, channel: 'plain' },
    { name: 'backPocket', size: [0.07, 0.06, 0.008], pos: [0.065, -0.05, 0.1055], color: C.slacksDark, channel: 'plain', mirror: true, ao: [0.9, 1] },
    // 벨트 파우치 (왼쪽 허리: 큰 것 + 작은 것, 오른쪽: 작은 것 하나). 손이 닿지 않게 약간 뒤쪽
    { name: 'pouchL1', size: [0.048, 0.115, 0.08], pos: [-0.208, -0.012, 0.07], color: C.belt, channel: 'plain', ao: [0.75, 1] },
    { name: 'pouchL1Lid', size: [0.052, 0.034, 0.084], pos: [-0.208, 0.035, 0.07], color: C.beltLight, channel: 'plain', ao: [0.85, 1] },
    { name: 'pouchL2', size: [0.062, 0.08, 0.05], pos: [-0.178, -0.0, 0.148], color: C.belt, channel: 'plain', ao: [0.75, 1] },
    { name: 'pouchL2Lid', size: [0.066, 0.026, 0.054], pos: [-0.178, 0.03, 0.148], color: C.beltLight, channel: 'plain', ao: [0.85, 1] },
    { name: 'pouchR1', size: [0.044, 0.09, 0.07], pos: [0.208, -0.01, 0.07], color: C.belt, channel: 'plain', ao: [0.75, 1] },
    { name: 'pouchR1Lid', size: [0.048, 0.03, 0.074], pos: [0.208, 0.03, 0.07], color: C.beltLight, channel: 'plain', ao: [0.85, 1] },
  ],
};

// ───────────────────────── 가슴 (피벗 = 가슴 아래, 숨쉬기 스케일) ─────────────────────────
export const CHEST: GroupSpec = {
  lofts: [
    {
      name: 'chest', sides: 8, offsetDeg: OCT, channel: 'cloth', capBottom: false, capTop: false,
      rings: [
        { y: 0, rx: 0.186, rz: 0.116, c: C.shirt, ao: 0.95 },
        { y: 0.13, rx: 0.204, rz: 0.124, c: C.shirt, ao: 1 },
        { y: 0.235, rx: 0.212, rz: 0.118, c: C.shirt, ao: 0.98 },        // 어깨선 (어깨 관절 높이)
        { y: 0.285, rx: 0.15, rz: 0.096, c: C.shirt, ao: 0.95 },         // 승모근 경사
        { y: 0.335, rx: 0.074, rz: 0.074, c: C.shirt, ao: 0.9 },
      ],
    },
    {
      // 칼라: 목을 두른 열린 고리
      name: 'collar', sides: 8, offsetDeg: OCT, channel: 'cloth', capBottom: false, capTop: false,
      rings: [
        { y: 0.318, rx: 0.09, rz: 0.084, c: C.shirt, ao: 0.78 },
        { y: 0.372, rx: 0.078, rz: 0.074, c: C.shirt, ao: 1 },
      ],
    },
  ],
  boxes: [
    // 앞면은 평평한 8각 면: z = -rz × cos(22.5°) ≈ -0.113
    { name: 'placket', size: [0.014, 0.28, 0.012], pos: [0, 0.14, -0.114], color: C.shirtDark, channel: 'plain', ao: [0.9, 1] },
    { name: 'button1', size: [0.012, 0.012, 0.014], pos: [0, 0.22, -0.117], color: C.shirtDark, channel: 'plain' },
    { name: 'button2', size: [0.012, 0.012, 0.014], pos: [0, 0.14, -0.117], color: C.shirtDark, channel: 'plain' },
    { name: 'button3', size: [0.012, 0.012, 0.014], pos: [0, 0.06, -0.117], color: C.shirtDark, channel: 'plain' },
    // 왼쪽(-x) 가슴 주머니: 본체 + 윗단 선
    { name: 'pocket', size: [0.076, 0.085, 0.01], pos: [-0.088, 0.125, -0.117], color: C.shirt, channel: 'plain', ao: [0.82, 1] },
    { name: 'pocketHem', size: [0.08, 0.012, 0.012], pos: [-0.088, 0.162, -0.118], color: C.shirtDark, channel: 'plain' },
    // 열린 칼라 안쪽 V (피부)
    { name: 'neckV', size: [0.07, 0.07, 0.01], pos: [0, 0.305, -0.1], color: C.skin, channel: 'plain', rot: [0.25, 0, 0], taperTop: 1.6, ao: [0.78, 1] },
    // 칼라 날개: 목 양옆에서 앞으로 접힌 삼각 면
    { name: 'collarFlap', size: [0.06, 0.05, 0.012], pos: [0.052, 0.34, -0.088], color: C.shirt, channel: 'plain', rot: [0.55, 0, -0.5], mirror: true, ao: [0.85, 1] },
  ],
};

// ───────────────────────── 머리 (피벗 = 턱 아래 목 위) ─────────────────────────
/** 얼굴 텍스처 → 두개골 정면 투영 UV. 크롭 원본 크기와 m/px 로 정한다 (docs/CHARACTER_ASSETS.md) */
export const FACE_TEX = {
  /** 얼굴 중심 x=0 이 텍스처 가로 중앙. 가로 한 변 = srcWidthPx × mPerPx */
  srcWidthPx: 72, srcHeightPx: 78, mPerPx: 0.0021,
  /** 텍스처 맨 아래(턱끝) 가 대응하는 머리 로컬 y */
  chinY: 0.03,
  /** 정면 텍스처를 입히는 링 범위 (0..이 인덱스) */
  faceRingMax: 4,
} as const;

/** 두개골 12각 링. 앞 6정점(±15°, ±45°, ±75°) 면이 얼굴 텍스처 면 */
export const HEAD: GroupSpec = {
  lofts: [
    {
      name: 'skull', sides: 12, offsetDeg: 15, channel: 'plain', capBottom: true, capTop: true, jitter: 0.02,
      rings: [
        { y: 0.03, rx: 0.034, rz: 0.05, cz: -0.02, c: C.skin, ao: 0.85 },   // 턱끝
        { y: 0.058, rx: 0.052, rz: 0.072, cz: -0.012, c: C.skin, ao: 0.92 }, // 턱선
        { y: 0.092, rx: 0.068, rz: 0.088, cz: -0.004, c: C.skin, ao: 1 },    // 볼
        { y: 0.13, rx: 0.074, rz: 0.093, c: C.skin, ao: 1 },                 // 광대·눈높이
        { y: 0.17, rx: 0.075, rz: 0.096, c: C.skin, ao: 1 },                 // 이마 (텍스처 윗단)
        { y: 0.21, rx: 0.07, rz: 0.097, cz: 0.006, c: C.skin, ao: 1 },
        { y: 0.243, rx: 0.055, rz: 0.082, cz: 0.01, c: C.skin, ao: 1 },
        { y: 0.256, rx: 0.03, rz: 0.05, cz: 0.012, c: C.skin, ao: 1 },
      ],
    },
    {
      // 머리카락: 두개골 위로 한 겹. 앞쪽(dyF)은 이마선을 위로, 옆쪽(dyS)은 귀 위로 올려 짧은 옆머리를 만든다
      name: 'hair', sides: 12, offsetDeg: 15, channel: 'plain', capBottom: false, capTop: true, jitter: 0.05,
      rings: [
        { y: 0.08, rx: 0.082, rz: 0.102, cz: 0.012, c: C.hair, ao: 0.78, dyF: 0.105, dyS: 0.085 },
        { y: 0.16, rx: 0.086, rz: 0.106, cz: 0.012, c: C.hair, ao: 0.9, dyF: 0.04 },
        { y: 0.21, rx: 0.086, rz: 0.106, cz: 0.014, c: C.hair, ao: 1 },
        { y: 0.252, rx: 0.07, rz: 0.092, cz: 0.016, c: C.hairLight, ao: 1 },
        { y: 0.274, rx: 0.042, rz: 0.062, cz: 0.014, c: C.hairLight, ao: 1 },
      ],
    },
    {
      name: 'neck', sides: 8, offsetDeg: OCT, channel: 'plain', capBottom: false, capTop: false,
      rings: [
        { y: -0.12, rx: 0.056, rz: 0.058, cz: 0.004, c: C.skin, ao: 0.78 },
        { y: 0.04, rx: 0.052, rz: 0.054, cz: -0.002, c: C.skin, ao: 0.9 },
      ],
    },
    {
      // 귀: 얇고 납작한 타원 (x 얇음), 바깥으로 약간 벌어짐
      name: 'ear', sides: 6, offsetDeg: HEX, channel: 'plain', capBottom: true, capTop: true, mirror: true, rotZ: 0.22, pos: [0.078, 0.122, 0.012],
      rings: [
        { y: -0.028, rx: 0.005, rz: 0.009, c: C.skin, ao: 0.9 },
        { y: 0, rx: 0.009, rz: 0.019, c: C.skinShade, ao: 0.85 },
        { y: 0.028, rx: 0.006, rz: 0.012, c: C.skin, ao: 1 },
      ],
    },
  ],
  boxes: [
    // 안경 다리(템플): 렌즈 바깥 모서리에서 귀로. 테·렌즈는 얼굴 텍스처에 있고, 옆모습에서 읽히게 하는 3D 부분
    { name: 'temple', size: [0.004, 0.005, 0.062], pos: [0.0765, 0.128, -0.012], color: C.frame, channel: 'plain', mirror: true, rot: [0, 0.14, 0] },
    { name: 'templeHook', size: [0.004, 0.022, 0.005], pos: [0.081, 0.117, 0.017], color: C.frame, channel: 'plain', mirror: true },
  ],
};

/** 코: 얼굴 텍스처 면에 붙는 작은 쐐기 (얼굴 채널, 정면 투영 UV). [윗끝, 코끝, 좌 밑, 우 밑] */
export const NOSE: readonly V3[] = [
  [0, 0.136, -0.091], [0, 0.092, -0.112], [-0.017, 0.088, -0.093], [0.017, 0.088, -0.093],
];

/** 앞머리 가닥: 이마 위에서 아래로 늘어진 뾰족 삼각뿔. [x, 늘어짐 끝 y, 가닥 폭, z 앞쪽 오프셋] */
export const FRINGE: readonly { x: number; tipY: number; w: number; tipZ: number }[] = [
  { x: -0.045, tipY: 0.162, w: 0.03, tipZ: -0.098 },
  { x: -0.016, tipY: 0.184, w: 0.026, tipZ: -0.098 },
  { x: 0.024, tipY: 0.192, w: 0.026, tipZ: -0.097 },
  { x: -0.066, tipY: 0.14, w: 0.024, tipZ: -0.08 },
  { x: 0.062, tipY: 0.16, w: 0.022, tipZ: -0.078 },
];
/** 윗머리 뾰족한 결: 정수리에서 위·뒤로 솟은 삼각뿔 (머리 로컬). [x, 시작 z, 끝 y, 끝 z, 폭] */
export const CROWN_SPIKES: readonly { x: number; z: number; tipY: number; tipZ: number; w: number }[] = [
  { x: -0.03, z: -0.03, tipY: 0.292, tipZ: -0.045, w: 0.04 },
  { x: 0.02, z: -0.04, tipY: 0.288, tipZ: -0.06, w: 0.04 },
  { x: 0.0, z: 0.02, tipY: 0.29, tipZ: 0.04, w: 0.045 },
  { x: -0.045, z: 0.03, tipY: 0.282, tipZ: 0.05, w: 0.04 },
];

/** 앞머리 가닥 시작 높이 / 시작 z */
export const FRINGE_BASE = { y: 0.215, z: -0.1 } as const;

// ───────────────────────── 팔다리 (오른쪽 기준으로 정의, 왼쪽은 x 미러) ─────────────────────────
export const THIGH: GroupSpec = {
  lofts: [{
    name: 'thigh', sides: 8, offsetDeg: OCT, channel: 'cloth', capTop: false, capBottom: false, innerAO: 0.16,
    rings: [
      { y: 0.03, rx: 0.102, rz: 0.108, c: C.slacks, ao: 0.78 },
      { y: -0.1, rx: 0.099, rz: 0.104, c: C.slacks, ao: 1 },
      { y: -0.28, rx: 0.089, rz: 0.092, c: C.slacks, ao: 0.98 },
      { y: -0.44, rx: 0.082, rz: 0.086, c: C.slacks, ao: 0.9 },
      { y: -0.465, rx: 0.083, rz: 0.087, c: C.slacks, ao: 0.7 },        // 무릎 접힘
    ],
  }],
  boxes: [],
};

export const SHIN: GroupSpec = {
  lofts: [
    {
      name: 'shin', sides: 8, offsetDeg: OCT, channel: 'cloth', capTop: false, capBottom: false, innerAO: 0.12,
      rings: [
        { y: 0.03, rx: 0.083, rz: 0.087, c: C.slacks, ao: 0.7 },
        { y: -0.12, rx: 0.079, rz: 0.082, c: C.slacks, ao: 1 },
        { y: -0.26, rx: 0.081, rz: 0.084, c: C.slacks, ao: 0.96 },
        { y: -0.3, rx: 0.094, rz: 0.102, c: C.slacks, ao: 0.78 },        // 단 (약간 넓은 핏)
      ],
    },
    {
      // 부츠 목
      name: 'bootShaft', sides: 8, offsetDeg: OCT, channel: 'plain', capTop: false, capBottom: false,
      rings: [
        { y: -0.22, rx: 0.066, rz: 0.074, c: C.boot, ao: 0.7 },
        { y: -0.3, rx: 0.07, rz: 0.078, c: C.boot, ao: 1 },
        { y: -0.4, rx: 0.07, rz: 0.082, cz: -0.004, c: C.boot, ao: 0.95 },
      ],
    },
    {
      // 부츠 발: 로프트 축(y) → 월드 -z (앞). rz = 높이 반, cz = 높이 중심 (무릎 기준 y)
      name: 'bootFoot', sides: 8, offsetDeg: OCT, channel: 'plain', capTop: true, capBottom: true, rotX: -Math.PI / 2,
      rings: [
        { y: -0.085, rx: 0.05, rz: 0.055, cz: -0.425, c: C.boot, ao: 0.72 },  // 뒤꿈치
        { y: -0.03, rx: 0.056, rz: 0.058, cz: -0.422, c: C.boot, ao: 1 },
        { y: 0.08, rx: 0.058, rz: 0.05, cz: -0.43, c: C.boot, ao: 1 },
        { y: 0.17, rx: 0.056, rz: 0.042, cz: -0.438, c: C.boot, ao: 0.95 },
        { y: 0.22, rx: 0.046, rz: 0.034, cz: -0.446, c: C.boot, ao: 0.85 },   // 앞코
      ],
    },
  ],
  boxes: [
    { name: 'sole', size: [0.124, 0.024, 0.31], pos: [0, -0.468, -0.07], color: C.bootDark, channel: 'plain', ao: [0.7, 1] },
    { name: 'tongue', size: [0.05, 0.02, 0.07], pos: [0, -0.404, -0.06], color: C.beltLight, channel: 'plain', rot: [0.35, 0, 0], ao: [0.8, 1] },
  ],
};

export const UPPER_ARM: GroupSpec = {
  lofts: [{
    name: 'sleeve', sides: 8, offsetDeg: OCT, channel: 'cloth', capTop: false, capBottom: true, innerAO: 0.2,
    rings: [
      { y: 0.03, rx: 0.05, rz: 0.058, c: C.shirt, ao: 0.85 },           // 어깨 위 (둥근 삼각근, 어깨선 위로 솟지 않게)
      { y: -0.03, rx: 0.063, rz: 0.066, c: C.shirt, ao: 0.95 },
      { y: -0.1, rx: 0.058, rz: 0.061, c: C.shirt, ao: 1 },
      { y: -0.2, rx: 0.054, rz: 0.057, c: C.shirt, ao: 0.95 },
      { y: -0.215, rx: 0.054, rz: 0.057, c: C.shirt, ao: 0.9 },
      { y: -0.235, rx: 0.07, rz: 0.072, c: C.shirtDark, ao: 0.78 },       // 걷어 올린 소매 접힘 (두꺼운 단)
      { y: -0.315, rx: 0.067, rz: 0.069, c: C.shirt, ao: 0.62 },
    ],
  }],
  boxes: [],
};

export const FOREARM: GroupSpec = {
  lofts: [
    {
      name: 'forearm', sides: 6, offsetDeg: HEX, channel: 'plain', capTop: false, capBottom: false, innerAO: 0.1,
      rings: [
        { y: 0.03, rx: 0.05, rz: 0.052, c: C.skin, ao: 0.7 },
        { y: -0.06, rx: 0.047, rz: 0.049, c: C.skin, ao: 1 },
        { y: -0.15, rx: 0.039, rz: 0.042, c: C.skin, ao: 0.96 },
        { y: -0.215, rx: 0.032, rz: 0.036, c: C.skin, ao: 0.9 },
      ],
    },
    {
      // 손목 장비 밴드 (검정)
      name: 'wristBand', sides: 6, offsetDeg: HEX, channel: 'plain', capTop: false, capBottom: false,
      rings: [
        { y: -0.14, rx: 0.043, rz: 0.046, c: C.band, ao: 0.9 },
        { y: -0.2, rx: 0.037, rz: 0.04, c: C.band, ao: 0.9 },
      ],
    },
    {
      // 주먹 (장치를 쥔다)
      name: 'hand', sides: 6, offsetDeg: HEX, channel: 'plain', capTop: false, capBottom: true,
      rings: [
        { y: -0.215, rx: 0.032, rz: 0.036, c: C.skin, ao: 0.82 },
        { y: -0.255, rx: 0.041, rz: 0.026, c: C.skin, ao: 1 },
        { y: -0.315, rx: 0.047, rz: 0.036, c: C.skin, ao: 0.98 },
        { y: -0.355, rx: 0.04, rz: 0.03, c: C.skin, ao: 0.82 },
      ],
    },
    {
      // 엄지
      name: 'thumb', sides: 6, offsetDeg: HEX, channel: 'plain', capTop: true, capBottom: true, pos: [-0.04, -0.28, -0.02], rotZ: 0.18,
      rings: [
        { y: 0.03, rx: 0.014, rz: 0.015, c: C.skin, ao: 0.85 },
        { y: -0.02, rx: 0.014, rz: 0.015, c: C.skin, ao: 1 },
        { y: -0.065, rx: 0.011, rz: 0.012, c: C.skin, ao: 0.9 },
      ],
    },
  ],
  boxes: [],
};

/** 왼쪽 손목 시계: 손목 바깥면에 붙는 케이스 (오른쪽 기준 좌표의 바깥 = +x; onlySide 로 왼쪽만) */
export const WATCH: BoxSpec = {
  name: 'watch', size: [0.014, 0.04, 0.044], pos: [0.043, -0.165, 0.0], color: C.band, channel: 'plain', onlySide: -1, ao: [0.85, 1],
};
export const WATCH_FACE: BoxSpec = {
  name: 'watchFace', size: [0.004, 0.028, 0.032], pos: [0.051, -0.165, 0.0], color: C.deviceScreen, channel: 'plain', onlySide: -1,
};

// ───────────────────────── 휴대 장치 (청록 발광 표시가 있는 검은 태블릿형 소형 장치) ─────────────────────────
/** 부착부(손) 원점, 장치 길이 방향 = 로컬 -y (앞 모서리 = 총구), 화면 = -z 쪽 */
export const DEVICE = {
  // 뒤쪽 약 4cm 가 주먹 안(손바닥)에 들어가고 나머지가 앞으로 나온다
  body: { size: [0.078, 0.205, 0.026] as V3, pos: [0, -0.065, 0] as V3 },
  screen: { size: [0.064, 0.172, 0.004] as V3, pos: [0, -0.065, -0.0125] as V3 },
  strip: { size: [0.008, 0.075, 0.003] as V3, pos: [-0.022, -0.05, -0.0152] as V3 },
  dot: { size: [0.008, 0.008, 0.003] as V3, pos: [-0.022, -0.012, -0.0152] as V3 },
  emitter: { size: [0.05, 0.007, 0.006] as V3, pos: [0, -0.17, -0.004] as V3 },
  grip: { size: [0.066, 0.1, 0.006] as V3, pos: [0, -0.02, 0.0135] as V3 },
  muzzleY: -0.18,
  handY: -0.0,
  /** 평상시 표시 발광 비율 (setGlow 값에 더해진다) */
  idleGlow: 0.6,
} as const;

/** 대략적인 서 있는 키 (hipY + 머리 피벗 + 머리카락 꼭대기). 테스트·튜닝 확인용 */
export function protagonistHeight(): number {
  const hair = HEAD.lofts.find((l) => l.name === 'hair')!;
  return JOINTS.hipY + JOINTS.neckY + hair.rings[hair.rings.length - 1].y;
}

/** 머리 높이(턱~정수리, 머리카락 포함) 대비 키 = 몇 등신 */
export function protagonistHeads(): number {
  const hair = HEAD.lofts.find((l) => l.name === 'hair')!;
  const headH = hair.rings[hair.rings.length - 1].y - FACE_TEX.chinY;
  return protagonistHeight() / headH;
}

/** 데이터가 쓰는 모든 색 (팔레트 준수 검사·집계용) */
export function allColors(): number[] {
  const out = new Set<number>();
  for (const g of [TORSO, CHEST, HEAD, THIGH, SHIN, UPPER_ARM, FOREARM]) {
    for (const l of g.lofts) for (const r of l.rings) out.add(r.c);
    for (const b of g.boxes) out.add(b.color);
  }
  out.add(WATCH.color); out.add(WATCH_FACE.color);
  return [...out];
}
