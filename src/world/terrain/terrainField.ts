// 계단형(terraced) 하이트필드: (x, z) → 높이 순수 함수 + 2단 LOD 격자 (근거리 고해상도 / 원거리 저해상도).
// 노이즈 높이(fBm+도메인 워프)를 층 단위(stepH)로 양자화해 블록 절벽 형태를 만든다. 게임플레이 구조(고원·협곡·패드·램프)는
// 데이터(MAP.terrain)로 지정되어 노이즈 위에 덮어쓴다. 시드 고정 결정적, THREE/Rapier 의존 없음 → 단위 테스트 대상.
// 모든 높이는 fineStep(램프용 미세 단위, 자동 계단 한계 이하)의 정수배이고, 일반 지형은 stepH(층 높이)의 정수배다.
import { clamp01, fbm01, lerp, ridged01, smoothstep, warp } from './noise';

export interface TerrainPad { id: string; center: [number, number]; radius: number; y: number; blend: number; note?: string }
/** 고원 위로 솟은 둔덕(시각·도달 실험용). 가장자리에서 안쪽으로 slope 만큼 오르다 top 에서 평평해진다 */
export interface BluffDef { center: [number, number]; size: [number, number]; top: number }
/** 램프 회랑: from→to 선분을 따라 y0→y1 로 fineStep 단위로 선형 변화 (오를 수 없는 단차를 걸어서 오르는 길) */
export interface RampDef { from: [number, number]; to: [number, number]; width: number; y0: number; y1: number }
/** 고원 바깥 계곡에서 솟는 메사/고원. top 은 고원 윗면(0) 기준 높이 */
export interface MassifDef { center: [number, number]; radius: number; top: number; seed: number }
export interface TerrainMapData {
  canyon: { zMin: number; zMax: number; depth: number };
  pads: readonly TerrainPad[];
  bluffs: readonly BluffDef[];
  ramps: readonly RampDef[];
  massifs: readonly MassifDef[];
}

export interface TerrainParams {
  seed: number;
  /** 층 높이(m): 일반 지형 높이는 이 값의 배수 */
  stepH: number;
  /** 램프 등 미세 높이 단위(m, ≤ 자동 계단 한계 0.5). 모든 높이는 이 단위의 정수배 */
  fineStep: number;
  /** 평탄 고원: half = 반폭(외곽 충돌 벽 바로 뒤), wobble = 가장자리가 바깥으로 구불거리는 최대 폭 */
  plateau: { half: number; wobble: number; wobbleScale: number };
  /** 고원 가장자리 → 계곡 바닥 경사 폭(m)의 범위와 변화 스케일, 거칠기(m) */
  rim: { widthMin: number; widthMax: number; scale: number; rough: number };
  /** 계곡 바닥 깊이 범위(m, 고원 기준 아래로)와 스케일, 바닥의 중간 주파수 기복 */
  valley: { depthMin: number; depthMax: number; scale: number; floorNoise: number; floorNoiseScale: number };
  /** 층 선반: 높이를 height 간격의 평평한 선반으로 끌어당긴다 (sharp > 1 일수록 평평한 선반+가파른 절벽) */
  tier: { height: number; sharp: number; fadeIn: number };
  massif: { warpScale: number; warpAmp: number; sharpMin: number; sharpMax: number; topNoise: number };
  /** 먼 산맥: r0~r1 에서 솟기 시작. beaconDip = 성이 보이는 방위 근처에서 낮춤 (백드롭을 가리지 않게) */
  mountain: { r0: number; r1: number; base: number; amp: number; scale: number; octaves: number; dip: { azimuthDeg: number; halfWidthDeg: number; min: number } };
  /** 고원 둔덕 */
  bluff: { slope: number; edgeNoise: number };
  /** 협곡이 고원 바깥으로 입을 벌리는 길이(m)와 벌어지는 기울기 */
  canyonMouth: { length: number; slope: number };
  /** farStepH = 원거리 링의 층 높이 (큰 실루엣만 읽히면 되므로 크게 둔다: 삼각형 절감) */
  lod: { nearHalf: number; nearCell: number; farHalf: number; farCell: number; farStepH: number; farRadius: number };
}

/** 정수 격자 높이 (fineStep 단위). 격자 [-half, half]² 를 cell 간격으로 나눈다 */
export interface HeightGrid { half: number; cell: number; n: number; levels: Int16Array }

const NONE = -32768; // 격자에 값이 없는 칸 (원거리 격자의 근거리 영역)

export class TerrainField {
  readonly near: HeightGrid;
  readonly far: HeightGrid;
  /** 생성 시간 (ms, 로딩 지연 평가용) */
  readonly buildMs: number;

  constructor(readonly P: TerrainParams, readonly M: TerrainMapData) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const L = P.lod;
    this.near = this.sampleGrid(L.nearHalf, L.nearCell, 0);
    this.far = this.sampleGrid(L.farHalf, L.farCell, L.nearHalf);
    this.buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  }

  private sampleGrid(half: number, cell: number, skipHalf: number): HeightGrid {
    const n = Math.round((2 * half) / cell);
    const levels = new Int16Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -half + (ix + 0.5) * cell, z = -half + (iz + 0.5) * cell;
        // 원거리 격자: 근거리 영역 안쪽, 그리고 카메라 far 너머(farRadius 바깥)는 비운다
        levels[iz * n + ix] = skipHalf > 0 && ((Math.abs(x) < skipHalf && Math.abs(z) < skipHalf) || Math.hypot(x, z) > this.P.lod.farRadius)
          ? NONE : Math.round(this.height(x, z, skipHalf > 0) / this.P.fineStep);
      }
    }
    return { half, cell, n, levels };
  }

  /** 격자 칸의 정수 높이 (범위 밖/빈 칸이면 null) */
  static cellLevel(g: HeightGrid, x: number, z: number): number | null {
    const ix = Math.floor((x + g.half) / g.cell), iz = Math.floor((z + g.half) / g.cell);
    if (ix < 0 || iz < 0 || ix >= g.n || iz >= g.n) return null;
    const v = g.levels[iz * g.n + ix];
    return v === NONE ? null : v;
  }

  /** 지형 윗면의 정수 높이 (LOD 인지: 근거리 칸 → 원거리 칸). 범위 밖은 null */
  levelAt(x: number, z: number): number | null {
    return TerrainField.cellLevel(this.near, x, z) ?? TerrainField.cellLevel(this.far, x, z);
  }

  /** 지형 윗면 높이(m). 렌더 메시·충돌 메시와 같은 값 (칸 단위로 평평). 범위 밖은 -Infinity */
  surface(x: number, z: number): number {
    const l = this.levelAt(x, z);
    return l === null ? -Infinity : l * this.P.fineStep;
  }

  /** (x,z) 가 가리키는 LOD 칸의 한 변 길이 */
  cellSizeAt(x: number, z: number): number {
    return TerrainField.cellLevel(this.near, x, z) !== null ? this.P.lod.nearCell : this.P.lod.farCell;
  }

  /** 양자화 전 연속 높이: 노이즈 + 계곡·메사·산맥·둔덕·패드 (램프·협곡 제외) */
  continuous(x: number, z: number): number {
    const P = this.P, half = P.plateau.half, s = P.seed;
    const ax = Math.abs(x), az = Math.abs(z);
    let H = 0;
    let d = 0;
    if (ax > half || az > half) {
      // 고원 가장자리: 바깥으로만 구불거리는 경계 → 외곽 거리 d
      const edge = half + P.plateau.wobble * fbm01(x / P.plateau.wobbleScale, z / P.plateau.wobbleScale, s + 1, 3);
      d = Math.hypot(Math.max(ax - edge, 0), Math.max(az - edge, 0));
    }
    const vfNoise = fbm01(x / P.valley.scale, z / P.valley.scale, s + 2, 3);
    const vf = -(P.valley.depthMin + (P.valley.depthMax - P.valley.depthMin) * vfNoise);
    if (d > 0) {
      const rimW = lerp(P.rim.widthMin, P.rim.widthMax, fbm01(x / P.rim.scale + 11, z / P.rim.scale - 5, s + 3, 2));
      const t = clamp01(d / rimW);
      const sh = t * t * (3 - 2 * t);
      const floor = vf + P.valley.floorNoise * (fbm01(x / P.valley.floorNoiseScale, z / P.valley.floorNoiseScale, s + 4, 2) - 0.5) * 2;
      H = lerp(0, floor, sh) + P.rim.rough * (fbm01(x / 17, z / 17, s + 5, 2) - 0.5) * 4 * sh * (1 - sh);
    }
    // 계곡에서 솟는 메사
    for (const m of this.M.massifs) {
      const R = m.radius * 1.7;
      if (Math.abs(x - m.center[0]) > R || Math.abs(z - m.center[1]) > R) continue;
      const [wx, wz] = warp(x, z, P.massif.warpScale, P.massif.warpAmp, m.seed);
      const q = Math.hypot(wx - m.center[0], wz - m.center[1]) / m.radius;
      if (q >= 1) continue;
      const sharp = lerp(P.massif.sharpMin, P.massif.sharpMax, fbm01(x / 90 + m.seed, z / 90, m.seed + 3, 2));
      const u = clamp01((1 - q) / sharp);
      const top = m.top + P.massif.topNoise * (fbm01(x / 23 + m.seed, z / 23, m.seed + 9, 2) - 0.5) * 2;
      H = Math.max(H, lerp(vf, top, u * u * (3 - 2 * u)));
    }
    // 먼 산맥
    const r = Math.hypot(x, z);
    if (r > P.mountain.r0) {
      const ramp = smoothstep(P.mountain.r0, P.mountain.r1, r);
      const MT = P.mountain;
      const az0 = Math.atan2(x, z) * 180 / Math.PI;
      let da = Math.abs(az0 - MT.dip.azimuthDeg) % 360; if (da > 180) da = 360 - da;
      const dip = lerp(MT.dip.min, 1, smoothstep(0, MT.dip.halfWidthDeg, da));
      const ridge = ridged01(x / MT.scale, z / MT.scale, s + 6, MT.octaves);
      H = Math.max(H, vf + ramp * (MT.base + MT.amp * ridge) * dip);
    }
    // 층 선반 (고원 안쪽에서는 영향 없음)
    if (d > 0 || r > P.mountain.r0) {
      const mask = smoothstep(0, P.tier.fadeIn, d);
      const T = P.tier.height, f = H / T, fl = Math.floor(f), fr = f - fl;
      const e = P.tier.sharp;
      const fr2 = fr < 0.5 ? 0.5 * Math.pow(2 * fr, e) : 1 - 0.5 * Math.pow(2 * (1 - fr), e);
      H = lerp(H, (fl + fr2) * T, Math.max(mask, r > P.mountain.r0 ? 1 : 0));
    }
    // 고원 둔덕
    for (const b of this.M.bluffs) {
      const ex = b.size[0] / 2 - Math.abs(x - b.center[0]), ez = b.size[1] / 2 - Math.abs(z - b.center[1]);
      if (ex <= -4 || ez <= -4) continue;
      const e = Math.min(ex, ez) + P.bluff.edgeNoise * (fbm01(x / 9, z / 9, s + 8, 2) - 0.5) * 2;
      if (e > 0) H = Math.max(H, Math.min(b.top, e * P.bluff.slope));
    }
    // 평탄 패드 (쌍둥이 낙하 구역 등): 중심~radius 는 정확히 pad.y
    for (const p of this.M.pads) {
      const dd = Math.hypot(x - p.center[0], z - p.center[1]);
      if (dd >= p.radius + p.blend) continue;
      const w = 1 - smoothstep(p.radius, p.radius + p.blend, dd);
      H = lerp(H, p.y, w);
    }
    return H;
  }

  /** 램프 회랑 안이면 fineStep 단위로 양자화된 높이, 아니면 null */
  private ramp(x: number, z: number): number | null {
    for (const r of this.M.ramps) {
      const dx = r.to[0] - r.from[0], dz = r.to[1] - r.from[1], len2 = dx * dx + dz * dz;
      const t = ((x - r.from[0]) * dx + (z - r.from[1]) * dz) / len2;
      if (t < 0 || t > 1) continue;
      const px = r.from[0] + dx * t, pz = r.from[1] + dz * t;
      if (Math.hypot(x - px, z - pz) > r.width / 2) continue;
      return Math.round(lerp(r.y0, r.y1, t) / this.P.fineStep) * this.P.fineStep;
    }
    return null;
  }

  /** 양자화된 최종 높이(m) 한 점 (격자 샘플링 함수). far = 원거리 링 층 높이 사용 */
  height(x: number, z: number, far = false): number {
    const P = this.P, sH = far ? P.lod.farStepH : P.stepH;
    let h = Math.round(this.continuous(x, z) / sH) * sH;
    const rp = this.ramp(x, z);
    if (rp !== null) h = rp;
    const c = this.M.canyon, zc = (c.zMin + c.zMax) / 2, hw = (c.zMax - c.zMin) / 2;
    const out = Math.max(0, Math.abs(x) - P.plateau.half);
    if (out <= P.canyonMouth.length && Math.abs(z - zc) <= hw + out * P.canyonMouth.slope) h = Math.min(h, -c.depth);
    return h;
  }
}

export function createTerrainField(P: TerrainParams, M: TerrainMapData) {
  return new TerrainField(P, M);
}
