import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothRings, type LoftRing } from '../render/meshBuilder';

/**
 * 스무스 곡면 빌더 (THREE 지오메트리만 사용, DOM 비의존 → 단위 테스트 가능).
 * meshBuilder(비인덱스 패싯)와 달리 "인덱스 + 정점 법선 평균" 으로 부드러운 곡면을 만든다 (재질은 createMaterial 의 smooth 옵션).
 * 곡면 = 위로 쌓은 타원(초타원) 링 로프트 (RingSurface). 링 사이는 PCHIP 보간, 주름(pleat)·아랫단 요철(hem)·구멍(hole)을 지원하고,
 * 같은 함수로 표면 위 점/법선을 뽑아 띠(ribbon)·관(tube)을 표면에 정확히 얹는다. 모든 지오메트리는 position/normal/color/uv + index 라 merge 가능.
 * 각도 규약(meshBuilder 와 동일): phi 0 = 앞(-z), + 방향 = +x (캐릭터 오른쪽), x = rx·sin, z = -rz·cos.
 */
export type V3 = readonly [number, number, number];
export type RGB = readonly [number, number, number];

const TAU = Math.PI * 2;
export const rad = (d: number) => (d * Math.PI) / 180;
const sgnPow = (x: number, p: number) => (p === 1 ? x : Math.sign(x) * Math.pow(Math.abs(x), p));

const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const lerpRgb = (a: number, b: number, t: number): RGB => {
  const A = rgb(a), B = rgb(b);
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
};
/** 평면 투영 UV (곡면 로프트가 아닌 작은 부품용): 위치의 연속 함수라 이음매가 없다 */
const planarUV = (x: number, y: number, z: number, tile: number): [number, number] => [(x * 0.8 + z * 0.6) / tile, y / tile];

export interface SRing { y: number; rx: number; rz: number; cx?: number; cz?: number; c: number; ao?: number }

export interface SurfaceOpts {
  /** 링 사이 PCHIP 보간 분할 수 (1 = 없음) */
  smooth?: number;
  /** 초타원 지수: 2 = 타원, 4 = 둥근 사각형 */
  n?: number;
  /** 세로 주름: 반경 × (1 + A(v)·sin(count·phi + phase)), A(v) = ampTop → ampHem (v: 0 = 맨 아래 링, 1 = 맨 위). shade = 주름 골/마루 명암 */
  pleat?: { count: number; ampTop: number; ampHem: number; power?: number; phase?: number; shade?: number };
  /** 아랫단 높이 요철: y += hem(phi)·(1-v)^3 (링이 아래→위 순서일 때) */
  hem?: (phi: number) => number;
  /** 구멍(후드 얼굴 열림): 앞쪽 타원(phi ±phiMax, 높이 yc ± hy, 라디안/m) 안 정점을 경계로 밀고 완전히 안쪽인 칸은 뺀다 */
  hole?: { phiMax: number; yc: number; hy: number };
}

export interface BuildOpts {
  /** 전체 둘레 기준 열 수 (arc 가 있으면 비례) */
  sides: number;
  /** 열린 곡면 각 범위(도). 없으면 닫힌 고리 */
  arc?: readonly [number, number];
  /** 닫힌 고리의 시작각(도): 이음매 위치 */
  start?: number;
  capTop?: boolean; capBottom?: boolean;
  /** 마개 색 (없으면 그 링 색) */
  capColor?: number;
  /** 천 텍스처 한 장이 덮는 길이(m). 없으면 UV 0 */
  tile?: number;
  /** 정점색 배율 (알베도 exposure) */
  exposure?: number;
  /** 안쪽을 바깥으로 (뒤집기) */
  flip?: boolean;
}

export class RingSurface {
  readonly rings: LoftRing[];
  private readonly cols: RGB[];
  private readonly desc: boolean;

  constructor(src: readonly SRing[], readonly o: SurfaceOpts = {}) {
    if (src.length < 2) throw new Error('RingSurface: 링이 2개 이상 필요');
    const f = Math.max(1, Math.round(o.smooth ?? 1));
    this.rings = f > 1 ? smoothRings(src, f) : [...src];
    this.cols = this.rings.map((_, k) => {
      const i = Math.min(Math.floor(k / f), src.length - 2);
      return lerpRgb(src[i].c, src[i + 1].c, Math.min(1, (k - i * f) / f));
    });
    this.desc = this.rings[this.rings.length - 1].y < this.rings[0].y;
  }

  get last() { return this.rings.length - 1; }

  /** 높이 y 에 해당하는 링 인덱스(실수). 링 y 가 단조라고 가정, 범위 밖은 끝값 */
  kAtY(y: number): number {
    const R = this.rings, m = R.length - 1;
    const sign = this.desc ? -1 : 1;
    if (sign * y <= sign * R[0].y) return 0;
    for (let k = 0; k < m; k++) {
      if (sign * y <= sign * R[k + 1].y) return k + (y - R[k].y) / (R[k + 1].y - R[k].y);
    }
    return m;
  }

  private pleatAmp(v: number): number {
    const p = this.o.pleat;
    if (!p) return 0;
    return p.ampTop + (p.ampHem - p.ampTop) * Math.pow(1 - v, p.power ?? 2);
  }

  /** 링 인덱스 k(실수) 높이의 단면 중심 */
  center(k: number): V3 {
    const m = this.last, kc = Math.min(m, Math.max(0, k));
    const k0 = Math.min(m - 1, Math.floor(kc)), t = kc - k0, a = this.rings[k0], b = this.rings[k0 + 1];
    return [(a.cx ?? 0) + ((b.cx ?? 0) - (a.cx ?? 0)) * t, a.y + (b.y - a.y) * t, (a.cz ?? 0) + ((b.cz ?? 0) - (a.cz ?? 0)) * t];
  }

  point(phi: number, k: number): [number, number, number] {
    const m = this.last, kc = Math.min(m, Math.max(0, k));
    const k0 = Math.min(m - 1, Math.floor(kc)), t = kc - k0, a = this.rings[k0], b = this.rings[k0 + 1];
    const L = (u: number, w: number) => u + (w - u) * t;
    const v = kc / m;
    const pl = this.o.pleat;
    const kr = pl ? 1 + this.pleatAmp(v) * Math.sin(pl.count * phi + (pl.phase ?? 0)) : 1;
    const e = 2 / (this.o.n ?? 2);
    const x = L(a.cx ?? 0, b.cx ?? 0) + L(a.rx, b.rx) * kr * sgnPow(Math.sin(phi), e);
    const z = L(a.cz ?? 0, b.cz ?? 0) - L(a.rz, b.rz) * kr * sgnPow(Math.cos(phi), e);
    let y = L(a.y, b.y);
    if (this.o.hem) y += this.o.hem(phi) * Math.pow(1 - v, 3);
    return [x, y, z];
  }

  private colorAt(phi: number, k: number): RGB {
    const m = this.last, kc = Math.min(m, Math.max(0, k));
    const k0 = Math.min(m - 1, Math.floor(kc)), t = kc - k0;
    const A = this.cols[k0], B = this.cols[k0 + 1];
    const ao = (this.rings[k0].ao ?? 1) + ((this.rings[k0 + 1].ao ?? 1) - (this.rings[k0].ao ?? 1)) * t;
    const pl = this.o.pleat;
    let sh = 1;
    if (pl?.shade) sh += pl.shade * (this.pleatAmp(kc / m) / Math.max(1e-6, pl.ampHem)) * Math.sin(pl.count * phi + (pl.phase ?? 0));
    const g = ao * sh;
    return [(A[0] + (B[0] - A[0]) * t) * g, (A[1] + (B[1] - A[1]) * t) * g, (A[2] + (B[2] - A[2]) * t) * g];
  }

  /** 표면 위 점 + 바깥 법선 (띠·관 경로용). 법선은 유한 차분 외적을 단면 중심에서 바깥쪽으로 정렬한 것 */
  frame(phi: number, k: number): { p: V3; n: V3 } {
    const dk = 0.05, dp = 0.01;
    const p = this.point(phi, k);
    const a = this.point(phi + dp, k), b = this.point(phi - dp, k), c = this.point(phi, k + dk), d = this.point(phi, k - dk);
    const u = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const w = new THREE.Vector3(c[0] - d[0], c[1] - d[1], c[2] - d[2]);
    const n = u.cross(w).normalize();
    const ctr = this.center(k);
    if (n.x * (p[0] - ctr[0]) + n.z * (p[2] - ctr[2]) < 0) n.negate();
    return { p, n: [n.x, n.y, n.z] };
  }

  /** 표면 곡선: ctrl = [phi(도), 높이 y] 제어점 (Catmull-Rom 보간). 아랫단 요철·주름을 그대로 따라간다 */
  path(ctrl: readonly (readonly [number, number])[], perSegment = 6): { p: V3; n: V3 }[] {
    const pts = ctrl.map(([deg, y]) => [rad(deg), this.kAtY(y)] as const);
    const out: { p: V3; n: V3 }[] = [];
    const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
      0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    for (let i = 0; i + 1 < pts.length; i++) {
      const P0 = pts[Math.max(0, i - 1)], P1 = pts[i], P2 = pts[i + 1], P3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < perSegment; s++) {
        const t = s / perSegment;
        out.push(this.frame(cr(P0[0], P1[0], P2[0], P3[0], t), cr(P0[1], P1[1], P2[1], P3[1], t)));
      }
    }
    const e = pts[pts.length - 1];
    out.push(this.frame(e[0], e[1]));
    return out;
  }

  build(o: BuildOpts): THREE.BufferGeometry {
    const m = this.last, closed = !o.arc;
    const a0 = closed ? rad(o.start ?? 0) : rad(o.arc![0]);
    const span = closed ? TAU : rad(o.arc![1] - o.arc![0]);
    const nu = Math.max(1, Math.ceil((o.sides * span) / TAU - 1e-6));
    const hole = this.o.hole;
    const exp = o.exposure ?? 1;
    const tile = o.tile ?? 0;
    const rMean = Math.max(...this.rings.map((r) => (r.rx + r.rz) / 2));
    const rep = tile > 0 ? Math.max(1, Math.round((TAU * rMean) / tile)) : 0;
    const pos: number[] = [], col: number[] = [], uv: number[] = [], inside: boolean[] = [];
    const push = (p: V3, c: RGB, u: number, v: number) => {
      pos.push(p[0], p[1], p[2]);
      col.push(c[0] * exp, c[1] * exp, c[2] * exp);
      uv.push(u, v);
    };

    for (let j = 0; j <= m; j++) {
      for (let i = 0; i <= nu; i++) {
        let phi = a0 + (span * i) / nu, kk = j, ins = false;
        if (hole) {
          const w = Math.atan2(Math.sin(phi), Math.cos(phi));
          const s0 = w / hole.phiMax, t0 = (this.point(phi, j)[1] - hole.yc) / hole.hy, d = Math.hypot(s0, t0);
          if (d < 1) {
            ins = true;
            const s = d < 1e-6 ? 1 : s0 / d, t = d < 1e-6 ? 0 : t0 / d;
            phi = phi - w + hole.phiMax * s;
            kk = this.kAtY(hole.yc + hole.hy * t);
          }
        }
        inside.push(ins);
        const p = this.point(phi, kk);
        push(p, this.colorAt(phi, kk), rep ? (phi / TAU) * rep : 0, tile > 0 ? p[1] / tile : 0);
      }
    }

    const idx: number[] = [];
    const at = (i: number, j: number) => j * (nu + 1) + i;
    const tri = (a: number, b: number, c: number) => (o.flip ? idx.push(a, c, b) : idx.push(a, b, c));
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < nu; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (hole && inside[a] && inside[b] && inside[c] && inside[d]) continue;
        if (this.desc) { tri(a, b, c); tri(a, c, d); } else { tri(a, c, b); tri(a, d, c); }
      }
    }

    if (closed) {
      const cap = (j: number) => {
        const ctr = this.center(j), r = this.rings[j];
        const c = o.capColor !== undefined ? rgb(o.capColor) : this.cols[j];
        const ao = r.ao ?? 1;
        const ci = pos.length / 3;
        push(ctr, [c[0] * ao, c[1] * ao, c[2] * ao], 0, tile > 0 ? ctr[1] / tile : 0);
        const up = j === m ? !this.desc : this.desc; // 바깥이 +y 인가
        for (let i = 0; i < nu; i++) {
          const v0 = at(i, j), v1 = at(i + 1, j);
          if (up) tri(ci, v1, v0); else tri(ci, v0, v1);
        }
      };
      if (o.capBottom) cap(0);
      if (o.capTop) cap(m);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (closed) {
      // 이음매(첫/끝 열)는 위치가 같고 UV 만 달라 복제돼 있다 → 법선을 평균해 줄무늬를 없앤다
      const nrm = g.attributes.normal as THREE.BufferAttribute;
      const t = new THREE.Vector3();
      for (let j = 0; j <= m; j++) {
        const i0 = at(0, j), i1 = at(nu, j);
        t.set(nrm.getX(i0) + nrm.getX(i1), nrm.getY(i0) + nrm.getY(i1), nrm.getZ(i0) + nrm.getZ(i1)).normalize();
        nrm.setXYZ(i0, t.x, t.y, t.z);
        nrm.setXYZ(i1, t.x, t.y, t.z);
      }
    }
    g.computeBoundingSphere();
    return g;
  }
}

const toGeometry = (pos: number[], col: number[], uv: number[], idx: number[]): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
};

export interface PartOpts { exposure?: number; ao?: number; tile?: number }

/**
 * 띠: 표면 경로(p, n) 를 따라 폭 width 의 면을 lift 만큼 띄워 얹는다 (벨트·끈·줄무늬·문양 선).
 * 점마다 폭 방향 = 진행 방향 × 법선, 삼각형은 법선 쪽이 앞면이 되게 정렬한다.
 */
export function ribbon(path: readonly { p: V3; n: V3 }[], width: number | ((t: number) => number), hex: number, lift: number, o: PartOpts = {}): THREE.BufferGeometry {
  const exp = (o.exposure ?? 1) * (o.ao ?? 1), tile = o.tile ?? 0.4, c = rgb(hex);
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const N = path.length;
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), W = new THREE.Vector3();
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = path[Math.max(0, i - 1)].p, b = path[Math.min(N - 1, i + 1)].p;
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    Nn.set(...path[i].n).normalize();
    W.crossVectors(T, Nn).normalize();
    const w = (typeof width === 'number' ? width : width(i / Math.max(1, N - 1))) / 2;
    const p = path[i].p;
    for (const s of [1, -1]) {
      const x = p[0] + Nn.x * lift + W.x * w * s, y = p[1] + Nn.y * lift + W.y * w * s, z = p[2] + Nn.z * lift + W.z * w * s;
      pos.push(x, y, z);
      col.push(c[0] * exp, c[1] * exp, c[2] * exp);
      const u = planarUV(x, y, z, tile);
      uv.push(u[0], u[1]);
    }
    normals.push(Nn.clone());
  }
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const addTri = (a: number, b: number, c2: number, n: THREE.Vector3) => {
    ab.subVectors(P(b), P(a)); ac.subVectors(P(c2), P(a));
    if (ab.cross(ac).dot(n) >= 0) idx.push(a, b, c2); else idx.push(a, c2, b);
  };
  for (let i = 0; i + 1 < N; i++) {
    const l0 = i * 2, r0 = i * 2 + 1, l1 = (i + 1) * 2, r1 = (i + 1) * 2 + 1;
    addTri(l0, r0, l1, normals[i]);
    addTri(r0, r1, l1, normals[i]);
  }
  return toGeometry(pos, col, uv, idx);
}

/** 직선 띠용 경로 (문양 선): a→b 를 samples 구간으로 나눈 점들, 법선 n 고정 */
export function linePath(a: V3, b: V3, n: V3, samples = 2): { p: V3; n: V3 }[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as V3, n };
  });
}

/** 관: 닫힌 경로를 따라 둥근 단면(반지름 radius)을 지난다 (후드 열린 가장자리의 말린 테두리). 열린 끝 마개는 만들지 않는다 */
export function tubeLoop(path: readonly { p: V3; n: V3 }[], radius: number, hex: number, o: PartOpts & { sides?: number } = {}): THREE.BufferGeometry {
  const exp = (o.exposure ?? 1) * (o.ao ?? 1), tile = o.tile ?? 0.4, c = rgb(hex), S = o.sides ?? 8, N = path.length;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), N2 = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = path[(i + N - 1) % N].p, b = path[(i + 1) % N].p, p = path[i].p;
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    Nn.set(...path[i].n).normalize();
    B.crossVectors(T, Nn).normalize();
    N2.crossVectors(B, T).normalize();
    for (let k = 0; k < S; k++) {
      const th = (TAU * k) / S, cs = Math.cos(th), sn = Math.sin(th);
      const x = p[0] + (N2.x * cs + B.x * sn) * radius, y = p[1] + (N2.y * cs + B.y * sn) * radius, z = p[2] + (N2.z * cs + B.z * sn) * radius;
      pos.push(x, y, z);
      col.push(c[0] * exp, c[1] * exp, c[2] * exp);
      const u = planarUV(x, y, z, tile);
      uv.push(u[0], u[1]);
    }
  }
  const ctr = (i: number) => new THREE.Vector3(path[i].p[0], path[i].p[1], path[i].p[2]);
  const V = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), out = new THREE.Vector3();
  const addTri = (ring: number, a: number, b: number, c2: number) => {
    ab.subVectors(V(b), V(a)); ac.subVectors(V(c2), V(a));
    out.copy(V(a)).add(V(b)).add(V(c2)).divideScalar(3).sub(ctr(ring));
    if (ab.cross(ac).dot(out) >= 0) idx.push(a, b, c2); else idx.push(a, c2, b);
  };
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let k = 0; k < S; k++) {
      const k2 = (k + 1) % S;
      const a = i * S + k, b = i * S + k2, c2 = i2 * S + k2, d = i2 * S + k;
      addTri(i, a, b, c2);
      addTri(i, a, c2, d);
    }
  }
  return toGeometry(pos, col, uv, idx);
}

/** 타원체 링 (중심 cy, 반축 rx·ry·rz): 양 끝은 작은 링으로 두고 capTop/capBottom 으로 닫는다 */
export function ellipsoidRings(cy: number, rx: number, ry: number, rz: number, c: number, o: { cx?: number; cz?: number; lat?: number; ao?: readonly [number, number] } = {}): SRing[] {
  const n = o.lat ?? 8, eps = 0.18, [aoB, aoT] = o.ao ?? [1, 1];
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n, ang = -Math.PI / 2 + eps + (Math.PI - 2 * eps) * t;
    return { y: cy + ry * Math.sin(ang), rx: rx * Math.cos(ang), rz: rz * Math.cos(ang), cx: o.cx, cz: o.cz, c, ao: aoB + (aoT - aoB) * t };
  });
}

/** 둥근 직육면체 링 (원점 중심, 폭 w·높이 h·깊이 d, 모서리 반경 r). RingSurface 의 n=4 와 함께 쓴다 */
export function roundBoxRings(w: number, h: number, d: number, c: number, o: { round?: number; ao?: readonly [number, number] } = {}): SRing[] {
  const r = Math.min(o.round ?? 0.02, h / 2 - 1e-3), [aoB, aoT] = o.ao ?? [1, 1];
  const ring = (y: number, s: number, ao: number): SRing => ({ y, rx: (w / 2) * s, rz: (d / 2) * s, c, ao });
  return [
    ring(-h / 2, 0.74, aoB), ring(-h / 2 + 0.35 * r, 0.94, aoB), ring(-h / 2 + r, 1, aoB),
    ring(h / 2 - r, 1, aoT), ring(h / 2 - 0.35 * r, 0.94, aoT), ring(h / 2, 0.74, aoT),
  ];
}

/** 변환 후 반환 (지오메트리는 제자리 변환) */
export function placed(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  g.applyMatrix4(m);
  g.computeBoundingSphere();
  return g;
}

/** 같은 부위의 지오메트리 병합. 비어 있으면 undefined */
export function mergeAll(list: readonly THREE.BufferGeometry[]): THREE.BufferGeometry | undefined {
  if (!list.length) return undefined;
  const g = mergeGeometries(list as THREE.BufferGeometry[], false);
  g.computeBoundingSphere();
  return g;
}

/** x 좌우 반전 복사본 (위치·법선 x 부호 반전 + 삼각형 방향 뒤집기). 비대칭 문양이 있는 팔 등 */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.clone();
  for (const name of ['position', 'normal'] as const) {
    const a = c.attributes[name] as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i));
    a.needsUpdate = true;
  }
  const ix = c.index!;
  for (let i = 0; i < ix.count; i += 3) {
    const b = ix.getX(i + 1), d = ix.getX(i + 2);
    ix.setX(i + 1, d);
    ix.setX(i + 2, b);
  }
  ix.needsUpdate = true;
  c.computeBoundingSphere();
  return c;
}
