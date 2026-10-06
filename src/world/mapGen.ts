import { mulberry } from './decor';
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

// ---------------------------------------------------------------------------------------------
// M1i: 황혼 블록 지형용 순수 생성기 (테라스 / 메사 / 협곡 돌출). 결정적 난수.
// ---------------------------------------------------------------------------------------------

/** 완만한 계단식 단차: 층마다 stepH 만큼 오르고 사방으로 inset(m) 만큼 줄어드는 판 쌓기. stepH ≤ 자동 계단 한계(0.5m) 이면 걸어서 오를 수 있다 */
export interface TerraceDef { center: [number, number]; size: [number, number]; layers: number; stepH: number; inset: number }

/** 아래부터 위로 쌓인 층 목록. 층 k 는 y ∈ [k·stepH, (k+1)·stepH], 한 변이 2·inset·k 만큼 줄어든다 (너무 작아지면 멈춘다) */
export function terraceBlocks(d: TerraceDef): BoxPart[] {
  const out: BoxPart[] = [];
  for (let k = 0; k < d.layers; k++) {
    const w = d.size[0] - 2 * d.inset * k, dd = d.size[1] - 2 * d.inset * k;
    if (w < 2 || dd < 2) break;
    out.push({ pos: [d.center[0], (k + 0.5) * d.stepH, d.center[1]], size: [w, d.stepH, dd] });
  }
  return out;
}

/** 시각 전용 메사(큰 층층 절벽): 아래 층이 가장 크고 위로 갈수록 조금 작아지며 무작위로 어긋난다. 층 높이는 [minH, maxH] */
export interface MesaDef { center: [number, number]; size: [number, number]; baseY: number; layers: number; layerH: [number, number]; seed: number }

export function mesaBlocks(d: MesaDef): BoxPart[] {
  const rnd = mulberry(d.seed);
  const out: BoxPart[] = [];
  let w = d.size[0], dd = d.size[1], cx = d.center[0], cz = d.center[1], y = d.baseY;
  for (let k = 0; k < d.layers; k++) {
    const h = d.layerH[0] + rnd() * (d.layerH[1] - d.layerH[0]);
    out.push({ pos: [cx, y + h / 2, cz], size: [w, h, dd] });
    y += h;
    const shrinkW = w * (0.12 + rnd() * 0.22), shrinkD = dd * (0.12 + rnd() * 0.22);
    cx += (rnd() - 0.5) * shrinkW; cz += (rnd() - 0.5) * shrinkD;
    w -= shrinkW; dd -= shrinkD;
    if (w < 4 || dd < 4) break;
  }
  return out;
}

export interface LedgeOpts { perWall: number; depth: [number, number]; thick: [number, number]; width: [number, number]; seed: number }

/**
 * 협곡 벽 돌출(시각 전용). 남쪽 벽(z = zMax, 북쪽을 향함)과 북쪽 벽(z = zMin, 남쪽을 향함)에 x 방향으로 흩어 놓는다.
 * skipX 구간(계단·다리 잔해 근처)에서는 만들지 않는다. 돌출 길이는 depth ≤ 1.2m 정도로 작게 해 통행을 거의 가리지 않는다.
 */
export function canyonLedges(o: LedgeOpts, canyon: { zMin: number; zMax: number; depth: number }, xRange: [number, number], skipX: readonly [number, number][]): BoxPart[] {
  const rnd = mulberry(o.seed);
  const out: BoxPart[] = [];
  for (const wall of [{ z: canyon.zMax, dir: -1 }, { z: canyon.zMin, dir: 1 }]) {
    for (let i = 0; i < o.perWall; i++) {
      const width = o.width[0] + rnd() * (o.width[1] - o.width[0]);
      const x = xRange[0] + width / 2 + rnd() * (xRange[1] - xRange[0] - width);
      const depth = o.depth[0] + rnd() * (o.depth[1] - o.depth[0]);
      const thick = o.thick[0] + rnd() * (o.thick[1] - o.thick[0]);
      const y = -canyon.depth + 1.5 + rnd() * (canyon.depth - 2.5);
      if (skipX.some(([a, b]) => x + width / 2 > a && x - width / 2 < b)) continue;
      // 벽 면에서 canyon 안쪽으로 depth 만큼 돌출 (일부는 벽 속으로 묻어 접합부가 보이지 않게 0.3m 더 넣는다)
      const zc = wall.z + wall.dir * (depth / 2 - 0.15);
      out.push({ pos: [x, y, zc], size: [width, thick, depth + 0.3] });
    }
  }
  return out;
}
