// 원경 백드롭 파라미터·UV 순수 계산 (원통 안쪽에서 바깥 면을 본다).
export interface BackdropCfg { width: number; height: number; radius: number; heightScale: number; horizonV: number }

/** 원통 높이(월드 m) = 둘레 × (이미지 높이/폭) × heightScale (heightScale 1 = 정사각 픽셀) */
export function cylinderHeight(c: BackdropCfg): number {
  return 2 * Math.PI * c.radius * (c.height / c.width) * c.heightScale;
}

/** 카메라 눈높이에서 원통 중심까지의 y 오프셋: 이미지 위쪽 horizonV 지점이 눈높이가 되도록 중심을 내린다 (양수 = 중심이 눈높이 위) */
export function centerOffsetY(c: BackdropCfg): number {
  return (c.horizonV - 0.5) * cylinderHeight(c);
}

/** 눈높이 위 고도각(rad)에 해당하는 이미지 행 (0 = 맨 위). 지평선 = horizonV·height */
export function rowAtElevation(c: BackdropCfg, elevRad: number): number {
  const h = cylinderHeight(c);
  const y = Math.tan(elevRad) * c.radius; // 눈높이 위 월드 높이
  return (c.horizonV - y / h) * c.height;
}

/**
 * 방위 θ = atan2(dx, dz) (rad) → 이미지 x 픽셀. 원통 안쪽에서 보면 θ 가 커질수록 화면 왼쪽이므로 이미지는 좌우가 뒤집혀 읽는다:
 * x = (1 - θ/2π)·width (mod width). 생성 스크립트와 같은 규약.
 */
export function azimuthToPixelX(thetaRad: number, width: number): number {
  const t = ((thetaRad / (2 * Math.PI)) % 1 + 1) % 1;
  return ((1 - t) % 1) * width;
}

/** 월드 수평 방향(dx, dz) → 방위 (rad) */
export const azimuthOf = (dx: number, dz: number) => Math.atan2(dx, dz);
