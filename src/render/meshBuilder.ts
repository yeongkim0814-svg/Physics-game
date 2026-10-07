import * as THREE from 'three';

/**
 * 로우폴리 메시 조립기 (THREE 지오메트리만 사용, DOM 비의존 → 단위 테스트 가능).
 * - 모든 삼각형을 비인덱스로 만든다 (면마다 정점색·법선이 독립 → 패싯 + 면별 미세 명도 변화)
 * - 정점색에 AO/지터/exposure 를 곱해 굽는다
 * - 변환 행렬(미러 포함)을 방출 시점에 적용하고, 삼각형 방향은 "바깥 방향 힌트" 로 자동 정렬해 미러에도 안전하다
 */

export type V3 = readonly [number, number, number];

export interface ShadeOpts {
  /** 알베도 배율 */
  exposure: number;
  /** 면 지터 기본 진폭 (± 비율) */
  jitter: number;
  seed: number;
}

export interface LoftRing {
  y: number; rx: number; rz: number; cx?: number; cz?: number;
  c: number; ao?: number; dyF?: number; dyS?: number; dyB?: number;
}

export interface LoftOpts {
  sides: number; offsetDeg: number;
  capBottom?: boolean; capTop?: boolean;
  innerAO?: number;
  jitter?: number;
  /** 천 UV 한 장이 덮는 길이 (m). 없으면 UV 0 */
  uvTile?: number;
  /** (링 인덱스, 띠 번호 k) → true 면 alt 빌더(얼굴 등)에 방출 */
  pick?: (ring: number, k: number) => boolean;
  /** alt 빌더용 UV (로컬 좌표 → uv). 없으면 기본 천 UV */
  altUV?: (x: number, y: number, z: number) => [number, number];
}

const rgb = (hex: number): V3 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** 정수 해시 → 0..1 (결정적) */
function hash1(i: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private uvs: number[] = [];
  private matrix = new THREE.Matrix4();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private tmpN = new THREE.Vector3();
  private tmpH = new THREE.Vector3();
  private count = 0;

  constructor(private shade: ShadeOpts) {}

  get triangles(): number { return this.count; }

  /** 이후 방출에 적용할 변환 (미러 포함). null = 항등 */
  setMatrix(m: THREE.Matrix4 | null) { this.matrix.copy(m ?? new THREE.Matrix4()); }

  /** 한 삼각형. hint = 바깥 방향 (로컬, 변환 전) — 법선이 그쪽을 향하도록 정점 순서를 정렬한다. color = 최종 곱셈 색 3개(정점별) */
  tri(
    a: V3, b: V3, c: V3, ca: V3, cb: V3, cc: V3, hint: V3,
    ua: readonly [number, number] = [0, 0], ub: readonly [number, number] = [0, 0], uc: readonly [number, number] = [0, 0],
  ) {
    const A = this.tmpA.set(a[0], a[1], a[2]).applyMatrix4(this.matrix);
    const B = this.tmpB.set(b[0], b[1], b[2]).applyMatrix4(this.matrix);
    const Cc = this.tmpC.set(c[0], c[1], c[2]).applyMatrix4(this.matrix);
    const H = this.tmpH.set(hint[0], hint[1], hint[2]).transformDirection(this.matrix);
    const n = this.tmpN.subVectors(B, A).cross(Cc.clone().sub(A));
    const flip = n.dot(H) < 0;
    const P = flip ? [A, Cc, B] : [A, B, Cc];
    const K = flip ? [ca, cc, cb] : [ca, cb, cc];
    const U = flip ? [ua, uc, ub] : [ua, ub, uc];
    for (let i = 0; i < 3; i++) {
      this.pos.push(P[i].x, P[i].y, P[i].z);
      this.col.push(K[i][0], K[i][1], K[i][2]);
      this.uvs.push(U[i][0], U[i][1]);
    }
    this.count++;
  }

  /** 면 지터: 삼각형 번호마다 결정적 명도 배율 */
  private jit(amp: number): number {
    return 1 + (hash1(this.count, this.shade.seed) - 0.5) * 2 * amp;
  }

  private tint(hex: number, ao: number, jit: number): V3 {
    const k = this.shade.exposure * ao * jit;
    const [r, g, b] = rgb(hex);
    return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
  }

  /** 링 로프트: 위로 쌓은 타원 단면. alt 는 pick 이 true 인 띠를 받는 두 번째 빌더(얼굴 텍스처 면) */
  loft(rings: readonly LoftRing[], o: LoftOpts, alt?: MeshBuilder) {
    const N = o.sides, off = (o.offsetDeg * Math.PI) / 180;
    const vert = (ri: number, k: number): V3 => {
      const r = rings[ri];
      const phi = off + (2 * Math.PI * k) / N;
      const s = Math.sin(phi), co = Math.cos(phi);
      const y = r.y + (r.dyF ?? 0) * Math.max(0, co) + (r.dyS ?? 0) * Math.abs(s) + (r.dyB ?? 0) * Math.max(0, -co);
      return [(r.cx ?? 0) + r.rx * s, y, (r.cz ?? 0) - r.rz * co];
    };
    const centerOf = (ri: number): V3 => [rings[ri].cx ?? 0, rings[ri].y, rings[ri].cz ?? 0];
    const amp = o.jitter ?? this.shade.jitter;
    const tile = o.uvTile ?? 0;
    // 사이드 AO: 안쪽(-x) 면
    const inner = (k: number) => {
      const phi = off + (2 * Math.PI * k) / N;
      return 1 - (o.innerAO ?? 0) * Math.max(0, -Math.sin(phi));
    };
    for (let ri = 0; ri + 1 < rings.length; ri++) {
      const r0 = rings[ri], r1 = rings[ri + 1];
      const perim = Math.PI * (r0.rx + r0.rz);
      const rep = tile > 0 ? Math.max(1, Math.round(perim / tile)) : 0;
      for (let k = 0; k < N; k++) {
        const target = alt && o.pick?.(ri, k) ? alt : this;
        const a = vert(ri, k), b = vert(ri, k + 1), c = vert(ri + 1, k + 1), d = vert(ri + 1, k);
        const mid: V3 = [(a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2];
        const ctr = centerOf(ri);
        const hint: V3 = [mid[0] - ctr[0], 0.0, mid[2] - ctr[2]];
        const isAlt = target !== this;
        const uvOf = (v: V3, kk: number): [number, number] => {
          if (isAlt && o.altUV) return o.altUV(v[0], v[1], v[2]);
          if (rep === 0) return [0, 0];
          return [(kk / N) * rep, v[1] / tile];
        };
        const j1 = target.jit(amp), j2 = target.jit(amp);
        const ao0 = (r0.ao ?? 1) * inner(k) , ao1 = (r1.ao ?? 1) * inner(k);
        const ao0b = (r0.ao ?? 1) * inner(k + 1), ao1b = (r1.ao ?? 1) * inner(k + 1);
        const col = (hex: number, ao: number, j: number): V3 => (isAlt ? [1, 1, 1] : target.tint(hex, ao, j));
        const ua = uvOf(a, k), ub = uvOf(b, k + 1), uc = uvOf(c, k + 1), ud = uvOf(d, k);
        target.tri(a, c, b, col(r0.c, ao0, j1), col(r0.c, ao1b, j1), col(r0.c, ao0b, j1), hint, ua, uc, ub);
        target.tri(a, d, c, col(r0.c, ao0, j2), col(r0.c, ao1, j2), col(r0.c, ao1b, j2), hint, ua, ud, uc);
      }
    }
    const cap = (ri: number, dir: 1 | -1) => {
      const r = rings[ri];
      const ctr = centerOf(ri);
      const hint: V3 = [0, dir, 0];
      for (let k = 0; k < N; k++) {
        const a = vert(ri, k), b = vert(ri, k + 1);
        const j = this.jit(amp);
        const cc = this.tint(r.c, (r.ao ?? 1) * (dir < 0 ? 0.8 : 1), j);
        this.tri(ctr, a, b, cc, cc, cc, hint);
      }
    };
    if (o.capBottom) cap(0, -1);
    if (o.capTop) cap(rings.length - 1, 1);
  }

  /** 박스 (회전·상단 테이퍼·상하 AO). uvTile>0 이면 면 법선 축별 평면 UV */
  box(size: V3, center: V3, hex: number, o: { rot?: V3; ao?: readonly [number, number]; taperTop?: number; jitter?: number; uvTile?: number } = {}) {
    const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const tp = o.taperTop ?? 1;
    const rot = new THREE.Euler(...(o.rot ?? [0, 0, 0]));
    const R = new THREE.Matrix4().makeRotationFromEuler(rot);
    const corner = (ix: number, iy: number, iz: number): V3 => {
      const t = iy > 0 ? tp : 1;
      const v = new THREE.Vector3(ix * sx * t, iy * sy, iz * sz * t).applyMatrix4(R);
      return [v.x + center[0], v.y + center[1], v.z + center[2]];
    };
    const [aoB, aoT] = o.ao ?? [1, 1];
    const amp = o.jitter ?? this.shade.jitter;
    const tile = o.uvTile ?? 0;
    // 6면: [법선, 4코너(반시계 무관, 방향은 hint 로 정렬)]
    const faces: { n: V3; q: [number, number, number][] }[] = [
      { n: [1, 0, 0], q: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
      { n: [-1, 0, 0], q: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
      { n: [0, 1, 0], q: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
      { n: [0, -1, 0], q: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
      { n: [0, 0, 1], q: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
      { n: [0, 0, -1], q: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
    ];
    for (const f of faces) {
      const hv = new THREE.Vector3(...f.n).applyMatrix4(R);
      const hint: V3 = [hv.x, hv.y, hv.z];
      const P = f.q.map((q) => corner(q[0], q[1], q[2]));
      const ao = f.q.map((q) => (q[1] > 0 ? aoT : aoB));
      const uv = f.q.map((q): [number, number] => {
        if (tile <= 0) return [0, 0];
        const ax = Math.abs(f.n[0]) > 0 ? [q[2] * sz, q[1] * sy] : Math.abs(f.n[2]) > 0 ? [q[0] * sx, q[1] * sy] : [q[0] * sx, q[2] * sz];
        return [ax[0] / tile, ax[1] / tile];
      });
      const j1 = this.jit(amp), j2 = this.jit(amp);
      const C = (i: number, j: number) => this.tint(hex, ao[i], j);
      this.tri(P[0], P[1], P[2], C(0, j1), C(1, j1), C(2, j1), hint, uv[0], uv[1], uv[2]);
      this.tri(P[0], P[2], P[3], C(0, j2), C(2, j2), C(3, j2), hint, uv[0], uv[2], uv[3]);
    }
  }

  /** 삼각뿔(앞머리 가닥 등): 밑면 3점 + 끝점. 밑면 중심 → 끝 방향이 위쪽 */
  pyramid(base: readonly [V3, V3, V3], tip: V3, hex: number, ao: readonly [number, number] = [1, 1]) {
    const ctr: V3 = [
      (base[0][0] + base[1][0] + base[2][0]) / 3, (base[0][1] + base[1][1] + base[2][1]) / 3, (base[0][2] + base[1][2] + base[2][2]) / 3,
    ];
    const sides: [V3, V3][] = [[base[0], base[1]], [base[1], base[2]], [base[2], base[0]]];
    for (const [p, q] of sides) {
      const j = this.jit(this.shade.jitter);
      const hint: V3 = [(p[0] + q[0]) / 2 + tip[0] - 2 * ctr[0], (p[1] + q[1]) / 2 + tip[1] - 2 * ctr[1], (p[2] + q[2]) / 2 + tip[2] - 2 * ctr[2]];
      this.tri(p, q, tip, this.tint(hex, ao[0], j), this.tint(hex, ao[0], j), this.tint(hex, ao[1], j), hint);
    }
  }

  /** 지정 UV 규칙으로 삼각형들을 방출 (코 쐐기 등): faces = 정점 3개 묶음 + 바깥 힌트 */
  fan(faces: readonly { v: readonly [V3, V3, V3]; hint: V3 }[], uv: (x: number, y: number, z: number) => [number, number], hex = 0xffffff) {
    for (const f of faces) {
      const c = this.tint(hex, 1, 1);
      this.tri(f.v[0], f.v[1], f.v[2], c, c, c, f.hint, uv(...f.v[0]), uv(...f.v[1]), uv(...f.v[2]));
    }
  }

  /** 지오메트리로 확정 (비인덱스, 법선 계산) */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** 링 목록에서 높이 y 의 단면 보간 (디테일 박스를 면 위에 붙일 때 쓰는 보조) */
export function sampleRings(rings: readonly LoftRing[], y: number) {
  let i = 0;
  while (i + 2 < rings.length && y > rings[i + 1].y) i++;
  const a = rings[i], b = rings[i + 1];
  const t = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y || 1)));
  const l = (p: number, q: number) => p + (q - p) * t;
  return { rx: l(a.rx, b.rx), rz: l(a.rz, b.rz), cx: l(a.cx ?? 0, b.cx ?? 0), cz: l(a.cz ?? 0, b.cz ?? 0) };
}

/** 단조 3차 에르미트(PCHIP) 기울기: 극값에서 0 → 급한 단차(소매 접힘 등)에서 오버슈트하지 않는다 */
function pchipSlopes(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length, h: number[] = [], d: number[] = [];
  for (let i = 0; i + 1 < n; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / (h[i] || 1e-9)); }
  const m = new Array<number>(n).fill(0);
  if (n === 2) { m[0] = m[1] = d[0]; return m; }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  return m;
}

/**
 * 링 사이에 곡선 보간 링을 끼워 윤곽을 부드럽게 하고 삼각형을 늘린다 (링당 factor-1 개 추가).
 * y·rx·rz·cx·cz·ao·dy* 는 y 에 대해 PCHIP 보간, 색은 아래 링 값 유지 (띠 색 경계 불변).
 */
export function smoothRings(rings: readonly LoftRing[], factor: number): LoftRing[] {
  if (factor <= 1 || rings.length < 2) return [...rings];
  const ys = rings.map((r) => r.y);
  const fields = ['rx', 'rz', 'cx', 'cz', 'ao', 'dyF', 'dyS', 'dyB'] as const;
  const slopes = Object.fromEntries(fields.map((f) => [f, pchipSlopes(ys, rings.map((r) => r[f] ?? (f === 'ao' ? 1 : 0)))])) as Record<(typeof fields)[number], number[]>;
  const out: LoftRing[] = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i], b = rings[i + 1], h = b.y - a.y;
    for (let s = 0; s < factor; s++) {
      if (s === 0) { out.push(a); continue; }
      const t = s / factor, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      const r: LoftRing = { y: a.y + h * t, rx: 0, rz: 0, c: a.c };
      for (const f of fields) {
        const v0 = a[f] ?? (f === 'ao' ? 1 : 0), v1 = b[f] ?? (f === 'ao' ? 1 : 0);
        (r as unknown as Record<string, number>)[f] = h00 * v0 + h10 * h * slopes[f][i] + h01 * v1 + h11 * h * slopes[f][i + 1];
      }
      out.push(r);
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}
