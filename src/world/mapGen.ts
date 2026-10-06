// 맵 생성용 순수 함수 (THREE/Rapier 의존 없음 → 단위 테스트 대상)

export type Vec3 = [number, number, number];
export type Dir = '+x' | '-x' | '+z' | '-z';

export interface StairDef {
  /** 첫(가장 낮은) 계단 윗면 중심의 수평 좌표 */
  start: [number, number];
  /** 계단이 높아지는 방향 */
  dir: Dir;
  steps: number;
  width: number;
  stepH: number;
  stepD: number;
  /** i 번째 계단 윗면 높이 = baseY + (i+1)·stepH (기본 0). 이어지는 계단/협곡 바닥에서 시작할 때 쓴다 */
  baseY?: number;
  /** 계단 속을 채우는 아래쪽 높이 (기본 0). 협곡 바닥에서 올라오는 계단은 바닥 높이로 지정 */
  floorY?: number;
}

export interface BoxPart { pos: Vec3; size: Vec3 }

/**
 * 계단 → 속이 찬 박스 목록. i 번째 계단은 바닥(y=0)에서 (i+1)·stepH 높이까지 채워
 * 틈이 없다 (baseY/floorY 로 시작 높이·바닥 높이를 바꿀 수 있다). 방향은 dir 로 정해지며 폭은 직교 축.
 */
export function stairBlocks(d: StairDef): BoxPart[] {
  const out: BoxPart[] = [];
  const sign = d.dir.startsWith('+') ? 1 : -1;
  const alongX = d.dir.endsWith('x');
  for (let i = 0; i < d.steps; i++) {
    const floor = d.floorY ?? 0;
    const h = (d.baseY ?? 0) + (i + 1) * d.stepH - floor;
    const along = (alongX ? d.start[0] : d.start[1]) + sign * i * d.stepD;
    const across = alongX ? d.start[1] : d.start[0];
    out.push(alongX
      ? { pos: [along, floor + h / 2, across], size: [d.stepD, h, d.width] }
      : { pos: [across, floor + h / 2, along], size: [d.width, h, d.stepD] });
  }
  return out;
}

/**
 * 박스의 가장 긴 수평 축을 따라 spacing 이하 간격으로 노드를 배치한다 (최소 1개).
 * 전도체 연쇄가 긴 구조물을 따라 끊기지 않도록 인접 노드 간격 ≤ spacing 을 보장.
 */
export function lineNodes(center: Vec3, size: Vec3, spacing: number): Vec3[] {
  const alongX = size[0] >= size[2];
  const len = alongX ? size[0] : size[2];
  const n = Math.max(1, Math.ceil(len / spacing));
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n - 0.5) * len;
    out.push(alongX ? [center[0] + t, center[1], center[2]] : [center[0], center[1], center[2] + t]);
  }
  return out;
}

/** 사각형 영역(물웅덩이)을 격자 셀 중심으로 채운 노드. 셀 크기 ≤ spacing */
export function gridNodes(center: [number, number], size: [number, number], spacing: number, y: number): Vec3[] {
  const nx = Math.max(1, Math.ceil(size[0] / spacing));
  const nz = Math.max(1, Math.ceil(size[1] / spacing));
  const out: Vec3[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      out.push([
        center[0] + ((i + 0.5) / nx - 0.5) * size[0], y,
        center[1] + ((j + 0.5) / nz - 0.5) * size[1],
      ]);
    }
  }
  return out;
}

/** 점이 사각형 영역(중심, 전체 크기) 안에 있는가 (수평) */
export function inRect(x: number, z: number, center: [number, number], size: [number, number]): boolean {
  return Math.abs(x - center[0]) <= size[0] / 2 && Math.abs(z - center[1]) <= size[1] / 2;
}
