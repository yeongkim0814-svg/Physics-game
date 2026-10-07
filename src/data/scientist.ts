import type { SRing, SurfaceOpts } from '../player/smoothMesh';

/**
 * 후드 로브 과학자 외형 사양 (사용자 컨셉 시트 'SCIENTIST'): 얼굴·머리·옷 안쪽이 보이지 않는 익명 연구자.
 * 흰 로브(소매 넓음·아랫단 비대칭) + 검은 하네스/배낭/벨트 파우치 + 후드 속 검은 얼굴 + 검은 장갑·군화, 붉은 포인트.
 * 곡면은 모두 링 로프트(player/smoothMesh.ts RingSurface) 로 만든다. 치수(m)·색·링 사양만 여기 둔다.
 * 원점 = 발바닥 중앙, 정면 = -z, 캐릭터의 오른쪽 = +x. 링 좌표는 각 관절 그룹 로컬(player/scientistMesh.ts 참고).
 */

export const SCOL = {
  robe: 0xe6e2dc,       // 로브 (바랜 흰색)
  robeShade: 0xc4bfb8,  // 주름 안쪽·소매 안
  hoodRim: 0xf0ece6,    // 후드 열린 테두리
  tunic: 0x1a1a1e,      // 로브 속 검은 옷
  trouser: 0x2a2a30,    // 바지
  glove: 0x2c2c32,      // 장갑
  boot: 0x211f22,       // 군화
  sole: 0x121214,       // 밑창
  strap: 0x1c1c20,      // 하네스 끈
  strapLight: 0x34343b, // 대각 가방끈
  belt: 0x222226,       // 벨트
  pouch: 0x29292e,      // 파우치 본체
  pouchLid: 0x3b3b42,   // 파우치 덮개
  pack: 0x26262b,       // 배낭
  metal: 0x80808a,      // 버클·금속
  glass: 0xbac7ca,      // 시료관
  voidFace: 0x08080b,   // 후드 속 얼굴(검정)
  red: 0x802827,        // 붉은 포인트(안감 선·소매 띠·배너 선)
  emblem: 0xdcb0a6,     // 연구소 문양 (옅은 장밋빛)
} as const;

/** 관절 위치 (부모 그룹 기준, m). 허벅지+정강이 = hipY (발바닥이 원점) */
export const SJ = {
  hipY: 0.93, hipX: 0.1,
  thighLen: 0.45, shinLen: 0.48, kneeY: -0.45,
  shoulderX: 0.185, shoulderY: 0.5,       // 몸통(엉덩이) 그룹 기준
  elbowY: -0.3, wristY: -0.3,
  neckY: 0.6,                            // 머리(후드) 피벗 = 목 (몸통 그룹 기준)
  /** 로브 아랫자락(앞/뒤) 피벗: 월드 높이. 이 높이에서 다리 스윙을 따라 흔들린다 */
  skirtPivotY: 0.8,
} as const;

/** 로브 앞 트임 반각 (도): 위에서 아래까지 같은 각이라 검은 속옷·바지가 세로로 보인다 */
export const GAP_DEG = 13;

const C = SCOL;

// ───────────────────────── 몸통 로브 (엉덩이 피벗, y = 엉덩이 기준) ─────────────────────────
export const ROBE_UPPER: readonly SRing[] = [
  { y: -0.32, rx: 0.285, rz: 0.215, c: C.robe, ao: 0.97 },
  { y: -0.16, rx: 0.255, rz: 0.192, c: C.robe, ao: 0.93 },
  { y: 0.0, rx: 0.235, rz: 0.172, c: C.robe, ao: 0.95 },   // 허리
  { y: 0.16, rx: 0.24, rz: 0.172, c: C.robe, ao: 1 },
  { y: 0.3, rx: 0.256, rz: 0.176, c: C.robe, ao: 1 },
  { y: 0.43, rx: 0.262, rz: 0.17, c: C.robe, ao: 1 },     // 어깨선
  { y: 0.5, rx: 0.205, rz: 0.14, c: C.robe, ao: 0.97 },
  { y: 0.555, rx: 0.14, rz: 0.115, c: C.robe, ao: 0.92 },
  { y: 0.595, rx: 0.085, rz: 0.085, c: C.robe, ao: 0.85 }, // 목 (후드가 덮는다)
];
export const ROBE_UPPER_OPTS: SurfaceOpts = {
  smooth: 2,
  pleat: { count: 12, ampTop: 0.0015, ampHem: 0.006, power: 1.5, shade: 0.05 },
};

/** 로브 속 검은 옷: 로브보다 살짝 안쪽, 앞 트임 사이로 보인다 */
export const TUNIC_INSET = 0.014;

// ───────────────────────── 아랫자락 (피벗 = skirtPivotY, y = 그 높이 기준) ─────────────────────────
/** 월드 y = pivot + y. 몸통 로브 밑단(월드 0.61)과 겹치는 윗부분은 1cm 안쪽 */
export const SKIRT: readonly SRing[] = [
  { y: -0.52, rx: 0.37, rz: 0.275, c: C.robe, ao: 0.8 },   // 아랫단
  { y: -0.35, rx: 0.322, rz: 0.242, c: C.robe, ao: 0.92 },
  { y: -0.19, rx: 0.281, rz: 0.211, c: C.robe, ao: 0.98 },
  { y: 0.0, rx: 0.247, rz: 0.184, c: C.robe, ao: 1 },
];
export const SKIRT_OPTS: SurfaceOpts = {
  smooth: 3,
  pleat: { count: 14, ampTop: 0.002, ampHem: 0.024, power: 2, shade: 0.09 },
  // 아랫단 높이 요철: 3 갈래 물결 + 뒤쪽 약간 길게 (컨셉의 비대칭 절개)
  hem: (phi) => 0.03 * Math.sin(3 * phi + 0.7) + 0.02 * Math.max(0, -Math.cos(phi)) - 0.012,
};
/** 앞자락이 뒷자락보다 살짝 바깥 (옆 겹침 구간에서 안 파묻히게) */
export const SKIRT_FRONT_SCALE = 1.012;
/** 앞/뒤 자락의 각 범위(도). 앞은 트임을 사이에 둔 좌우 두 장 */
export const SKIRT_ARCS = {
  frontR: [GAP_DEG, 100] as const,
  frontL: [360 - 100, 360 - GAP_DEG] as const,
  back: [80, 280] as const,
};

// ───────────────────────── 후드 (피벗 = 목) ─────────────────────────
export const HOOD: readonly SRing[] = [
  { y: -0.1, rx: 0.235, rz: 0.19, c: C.robe, ao: 0.85 },   // 어깨로 흘러내린 카울
  { y: -0.04, rx: 0.175, rz: 0.165, cz: 0.005, c: C.robe, ao: 0.9 },
  { y: 0.05, rx: 0.124, rz: 0.14, cz: 0.012, c: C.robe, ao: 0.96 },
  { y: 0.13, rx: 0.126, rz: 0.146, cz: 0.016, c: C.robe, ao: 1 },
  { y: 0.2, rx: 0.116, rz: 0.14, cz: 0.024, c: C.robe, ao: 1 },
  { y: 0.255, rx: 0.09, rz: 0.112, cz: 0.04, c: C.robe, ao: 1 },
  { y: 0.292, rx: 0.048, rz: 0.07, cz: 0.062, c: C.robe, ao: 1 },
  { y: 0.305, rx: 0.022, rz: 0.036, cz: 0.074, c: C.robe, ao: 1 },  // 뒤로 살짝 쏠린 끝
];
/** 얼굴 열림: phi ±36°, 높이 0.14 ± 0.1 타원 */
export const HOOD_HOLE = { phiMaxDeg: 40, yc: 0.14, hy: 0.105 } as const;
export const HOOD_OPTS: SurfaceOpts = {
  smooth: 2,
  pleat: { count: 9, ampTop: 0.0015, ampHem: 0.008, power: 1.5, shade: 0.06 },
};
export const HOOD_RIM_RADIUS = 0.012;
/** 후드 속 검은 얼굴: 타원체 (머리 로컬) */
export const FACE_VOID = { cy: 0.14, rx: 0.1, ry: 0.125, rz: 0.1, cz: 0.0 } as const;

// ───────────────────────── 소매 (어깨/팔꿈치 피벗, y 는 아래로 감소) ─────────────────────────
export const SLEEVE_UPPER: readonly SRing[] = [
  { y: 0.085, rx: 0.05, rz: 0.048, c: C.robe, ao: 0.9 },    // 어깨 위 둥근 삼각근 (캡으로 닫는다)
  { y: 0.04, rx: 0.075, rz: 0.072, c: C.robe, ao: 0.9 },
  { y: -0.06, rx: 0.085, rz: 0.08, c: C.robe, ao: 1 },
  { y: -0.17, rx: 0.09, rz: 0.085, c: C.robe, ao: 0.98 },
  { y: -0.3, rx: 0.1, rz: 0.093, c: C.robe, ao: 0.95 },
];
export const SLEEVE_FORE: readonly SRing[] = [
  { y: 0.02, rx: 0.1, rz: 0.093, c: C.robe, ao: 0.95 },
  { y: -0.08, rx: 0.108, rz: 0.098, c: C.robe, ao: 0.97 },
  { y: -0.18, rx: 0.125, rz: 0.108, c: C.robe, ao: 0.92 },
  { y: -0.27, rx: 0.14, rz: 0.118, c: C.robeShade, ao: 0.82 }, // 살짝 벌어진 소맷부리
];
export const SLEEVE_OPTS: SurfaceOpts = {
  smooth: 3,
  pleat: { count: 8, ampTop: 0.001, ampHem: 0.012, power: 2, shade: 0.07 },
};
/** 장갑 (아래팔 로컬): 소맷부리 안에서 시작해 주먹으로 */
export const GLOVE: readonly SRing[] = [
  { y: -0.2, rx: 0.036, rz: 0.036, c: C.glove, ao: 0.8 },
  { y: -0.27, rx: 0.042, rz: 0.04, c: C.glove, ao: 0.95 },
  { y: -0.315, rx: 0.05, rz: 0.04, c: C.glove, ao: 1 },
  { y: -0.365, rx: 0.044, rz: 0.036, c: C.glove, ao: 0.95 },
  { y: -0.395, rx: 0.026, rz: 0.022, c: C.glove, ao: 0.9 },
];

// ───────────────────────── 다리 ─────────────────────────
export const THIGH_RINGS: readonly SRing[] = [
  { y: 0.03, rx: 0.105, rz: 0.11, c: C.trouser, ao: 0.8 },
  { y: -0.15, rx: 0.1, rz: 0.105, c: C.trouser, ao: 1 },
  { y: -0.3, rx: 0.09, rz: 0.095, c: C.trouser, ao: 0.97 },
  { y: -0.46, rx: 0.082, rz: 0.088, c: C.trouser, ao: 0.85 },
];
export const SHIN_RINGS: readonly SRing[] = [
  { y: 0.02, rx: 0.082, rz: 0.088, c: C.trouser, ao: 0.8 },
  { y: -0.12, rx: 0.078, rz: 0.085, c: C.trouser, ao: 1 },
  { y: -0.25, rx: 0.077, rz: 0.082, c: C.trouser, ao: 0.95 },
  { y: -0.3, rx: 0.09, rz: 0.095, c: C.trouser, ao: 0.8 },
];
/** 군화 목 (무릎 로컬) */
export const BOOT_SHAFT: readonly SRing[] = [
  { y: -0.2, rx: 0.088, rz: 0.094, c: C.boot, ao: 0.75 },
  { y: -0.27, rx: 0.093, rz: 0.1, c: C.boot, ao: 1 },
  { y: -0.36, rx: 0.095, rz: 0.106, cz: -0.002, c: C.boot, ao: 0.97 },
  { y: -0.42, rx: 0.093, rz: 0.104, cz: -0.004, c: C.boot, ao: 0.85 },
];
/** 군화 발 (축 = 앞, 링 rz = 높이 반, cz = 높이 중심 / 무릎 기준 y). 로프트 축 y → 월드 -z */
export const BOOT_FOOT: readonly SRing[] = [
  { y: -0.105, rx: 0.066, rz: 0.056, cz: -0.395, c: C.boot, ao: 0.8 },
  { y: -0.03, rx: 0.078, rz: 0.062, cz: -0.396, c: C.boot, ao: 1 },
  { y: 0.08, rx: 0.082, rz: 0.058, cz: -0.405, c: C.boot, ao: 1 },
  { y: 0.19, rx: 0.078, rz: 0.048, cz: -0.415, c: C.boot, ao: 0.97 },
  { y: 0.27, rx: 0.062, rz: 0.034, cz: -0.425, c: C.boot, ao: 0.9 },
];
export const BOOT_SOLE: readonly SRing[] = [
  { y: -0.12, rx: 0.07, rz: 0.0225, cz: -0.4575, c: C.sole, ao: 0.8 },
  { y: -0.05, rx: 0.088, rz: 0.0225, cz: -0.4575, c: C.sole, ao: 0.9 },
  { y: 0.1, rx: 0.092, rz: 0.0225, cz: -0.4575, c: C.sole, ao: 0.9 },
  { y: 0.23, rx: 0.086, rz: 0.0225, cz: -0.4575, c: C.sole, ao: 0.9 },
  { y: 0.295, rx: 0.064, rz: 0.0225, cz: -0.4575, c: C.sole, ao: 0.85 },
];

// ───────────────────────── 장비 (몸통 로컬) ─────────────────────────
/** 배낭 (둥근 상자): 중심·크기. 뒤(+z) 면 z = center.z + depth/2 */
export const PACK = { center: [0, 0.27, 0.245] as const, size: [0.3, 0.38, 0.15] as const, round: 0.03 };
/** 배낭 옆 시료관 두 개 */
export const PACK_TUBE = { x: 0.178, z: 0.32, y0: 0.1, y1: 0.42, r: 0.028 };
/** 벨트 높이 범위 (몸통 로컬) */
export const BELT_Y = [0.0, 0.075] as const;
