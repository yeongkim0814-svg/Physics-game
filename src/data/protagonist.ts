import { COL } from '../render/palette';

/**
 * 주인공 외형 사양 (GAME_DESIGN 14-1 '주인공 외형 [확정]'). 치수(m)·색·파츠 위치를 데이터로 두고
 * player/protagonistCharacter.ts 가 이것을 읽어 조립한다. 원점 = 발바닥 중앙, 정면 = -z.
 * 좌표는 각 그룹(관절) 로컬. mirror 파츠는 x 부호를 뒤집은 복제본이 반대편에 함께 생긴다.
 */

export type V3 = readonly [number, number, number];
export type TexId = 'face' | 'shirtFront' | 'shirtBack' | 'pelvisFront' | 'pelvisBack';
export type TexFace = 'front' | 'back' | 'left' | 'right' | 'top';

export interface PartSpec {
  name: string;
  size: V3;
  pos: V3;
  color: number;
  rot?: V3;
  /** 면별 절차 텍스처 (front = -z, back = +z, right = +x, left = -x) */
  tex?: Partial<Record<TexFace, TexId>>;
  mirror?: boolean;
  /** 자체 발광 비율 0..1 (색 × glow 를 emissive 로 더함). 석양 그늘면에서도 셔츠·얼굴이 읽히게 하는 가독성 보정 */
  glow?: number;
}

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** 팔레트에서 파생한 색. ink(머리·안경테)는 팔레트 최암색(grout)보다 약간 어두운 남보라 검정 */
export const PCOL = {
  skin: mix(COL.dust, COL.cream, 0.35),   // 따뜻한 베이지~크림
  skinShade: COL.sandDark,                 // 코 그늘·입
  ink: 0x1c1a28,                           // 검은 머리 / 안경테 / 눈·눈썹
  lens: mix(COL.cream, COL.dust, 0.3),     // 렌즈 안쪽 (살짝 밝게)
  glint: 0xffffff,                         // 렌즈 반사선 (유일한 순백)
  shirt: COL.cream,
  shirtLine: mix(COL.cream, COL.sandDark, 0.45), // 단추 선·칼라선·주머니선
  slacks: COL.stone,                       // 회색(청회색 쪽) 슬랙스
  slacksLine: COL.stoneDark,
  belt: COL.shade,
  hardware: COL.copper,                    // 버클·도구 루프
  shoe: COL.copperDark,                    // 어두운 갈색
} as const;

/** 관절 위치 (부모 그룹 기준) */
export const JOINTS = {
  hipY: 0.86,              // 몸통·다리 피벗 높이 (root 기준)
  hipX: 0.12,              // 좌우 다리 x
  kneeY: -0.43,            // 허벅지 끝 (다리 그룹 기준)
  shoulderX: 0.37, shoulderY: 0.46, // 어깨 (몸통 그룹 기준)
  elbowY: -0.3,            // 위팔 끝 (팔 그룹 기준)
  wristY: -0.28,           // 손 = 무기 부착부 (팔뚝 그룹 기준)
  neckY: 0.58,             // 머리 피벗 (몸통 그룹 기준)
} as const;

const T = PCOL;
/** 자체 발광 비율: 셔츠(크림)가 보랏빛 그늘에서 회색으로 죽지 않게 / 피부·바지는 약하게 */
export const GLOW = { shirt: 0.4, skin: 0.22, slacks: 0.16 } as const;

/** 몸통 그룹 (피벗 = 허리/엉덩이). 구부정하게 숙이는 회전과 숨쉬기는 이 그룹과 chest 그룹에 걸린다 */
export const TORSO_PARTS: readonly PartSpec[] = [
  { name: 'pelvis', size: [0.46, 0.2, 0.28], pos: [0, 0.02, 0], color: T.slacks, tex: { front: 'pelvisFront', back: 'pelvisBack' }, glow: GLOW.slacks },
  { name: 'belt', size: [0.48, 0.06, 0.3], pos: [0, 0.12, 0], color: T.belt },
  { name: 'buckle', size: [0.07, 0.07, 0.02], pos: [0, 0.12, -0.16], color: T.hardware },
  // 벨트 루프(앞 좌우 / 뒤 중앙)와 도구용 루프(왼쪽 허리 옆, 나중에 장비를 거는 자리)
  { name: 'beltLoop', size: [0.035, 0.09, 0.03], pos: [0.17, 0.12, -0.155], color: T.slacksLine, mirror: true },
  { name: 'beltLoopBack', size: [0.035, 0.09, 0.03], pos: [0, 0.12, 0.155], color: T.slacksLine },
  { name: 'toolLoop', size: [0.045, 0.11, 0.07], pos: [-0.25, 0.09, 0], color: T.hardware },
  { name: 'shirtLow', size: [0.44, 0.15, 0.28], pos: [0, 0.225, 0], color: T.shirt, glow: GLOW.shirt },
];

/** 가슴 그룹 (피벗 = 가슴 아래, 숨쉬기 스케일). 어깨 관절은 몸통 그룹에 있다 */
export const CHEST = {
  pivotY: 0.3,
  parts: [
    { name: 'chest', size: [0.58, 0.24, 0.32], pos: [0, 0.12, 0], color: T.shirt, tex: { front: 'shirtFront', back: 'shirtBack' }, glow: GLOW.shirt },
    { name: 'neck', size: [0.14, 0.1, 0.14], pos: [0, 0.27, 0], color: T.skin, glow: GLOW.skin },
    { name: 'collarRing', size: [0.22, 0.05, 0.22], pos: [0, 0.25, 0], color: T.shirt, glow: GLOW.shirt },
    { name: 'collarFlap', size: [0.1, 0.05, 0.04], pos: [0.06, 0.24, -0.12], rot: [0.35, 0, -0.45], color: T.shirt, mirror: true, glow: GLOW.shirt },
  ] as readonly PartSpec[],
} as const;

/** 머리 그룹 (피벗 = 목 위). 얼굴 텍스처는 두개골 앞면. 머리는 PS1 가독성을 위해 약간 크게 */
export const HEAD_PARTS: readonly PartSpec[] = [
  { name: 'skull', size: [0.34, 0.32, 0.34], pos: [0, 0.16, 0], color: T.skin, tex: { front: 'face' }, glow: GLOW.skin },
  { name: 'hairTop', size: [0.37, 0.07, 0.37], pos: [0, 0.335, 0], color: T.ink },
  { name: 'hairBack', size: [0.37, 0.25, 0.06], pos: [0, 0.2, 0.185], color: T.ink },
  { name: 'hairSide', size: [0.04, 0.17, 0.3], pos: [0.19, 0.235, 0.02], color: T.ink, mirror: true },
  { name: 'fringe', size: [0.35, 0.05, 0.04], pos: [0, 0.305, -0.185], color: T.ink },
  { name: 'ear', size: [0.03, 0.08, 0.05], pos: [0.18, 0.15, 0.02], color: T.skin, mirror: true, glow: GLOW.skin },
  // 안경 다리(템플): 옆모습에서도 안경이 읽히게
  { name: 'temple', size: [0.012, 0.014, 0.17], pos: [0.176, 0.17, -0.085], color: T.ink, mirror: true },
];

/** 다리: 허벅지(엉덩이 피벗) → 정강이(무릎 피벗) + 신발. 허벅지·어깨는 실질적으로 굵게 */
export const THIGH_PARTS: readonly PartSpec[] = [
  { name: 'thigh', size: [0.2, 0.43, 0.24], pos: [0, -0.215, 0], color: T.slacks, glow: GLOW.slacks },
];
export const SHIN_PARTS: readonly PartSpec[] = [
  { name: 'shin', size: [0.17, 0.35, 0.2], pos: [0, -0.175, 0], color: T.slacks, glow: GLOW.slacks },
  { name: 'cuff', size: [0.19, 0.05, 0.22], pos: [0, -0.33, 0], color: T.slacksLine },
  { name: 'shoe', size: [0.2, 0.1, 0.32], pos: [0, -0.38, -0.05], color: T.shoe },
];

/** 팔: 위팔(셔츠 소매) → 팔뚝(소매를 걷어 맨살) → 손 */
export const UPPER_ARM_PARTS: readonly PartSpec[] = [
  { name: 'shoulder', size: [0.2, 0.16, 0.2], pos: [0, 0, 0], color: T.shirt, glow: GLOW.shirt },
  { name: 'upperArm', size: [0.16, 0.3, 0.17], pos: [0, -0.15, 0], color: T.shirt, glow: GLOW.shirt },
  { name: 'rolledCuff', size: [0.18, 0.07, 0.19], pos: [0, -0.3, 0], color: T.shirt, glow: GLOW.shirt },
];
export const FOREARM_PARTS: readonly PartSpec[] = [
  { name: 'forearm', size: [0.13, 0.22, 0.14], pos: [0, -0.12, 0], color: T.skin, glow: GLOW.skin },
  { name: 'hand', size: [0.11, 0.1, 0.11], pos: [0, -0.27, 0], color: T.skin, glow: GLOW.skin },
];

/** 대략적인 서 있는 키 (hipY + 목 피벗 + 머리 상단). 테스트·튜닝 확인용 */
export function protagonistHeight(): number {
  const head = HEAD_PARTS.find((p) => p.name === 'hairTop')!;
  return JOINTS.hipY + JOINTS.neckY + head.pos[1] + head.size[1] / 2;
}

/** 파츠 사양 전체 (색 검사·정점 수 집계용) */
export const ALL_PARTS: readonly PartSpec[] = [
  ...TORSO_PARTS, ...CHEST.parts, ...HEAD_PARTS, ...THIGH_PARTS, ...SHIN_PARTS, ...UPPER_ARM_PARTS, ...FOREARM_PARTS,
];
