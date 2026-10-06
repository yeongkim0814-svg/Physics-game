import type { V3, VoxelGrid } from './voxelCodec';

/**
 * 복셀 → 그리디 메싱 (THREE 비의존: 배열만 만든다 → 단위 테스트 가능).
 * - 선택 규칙(include)을 만족하는 복셀만 그 그룹의 면을 만든다. 면 생략은 "같은 그룹 이웃이 있을 때만" (그룹끼리 움직이므로 경계 면은 남긴다)
 * - 같은 색 + 같은 AO(꼭짓점 4개 모두 동일)인 인접 면은 하나의 사각형으로 병합. AO 가 균일하지 않은 면은 병합하지 않는다
 * - 정점색 = 팔레트색 × exposure × AO 계수. AO 는 전체 복셀(다른 그룹 포함) 기준 코너 가림 (0~3 → aoCurve)
 */
export interface MeshOptions {
  voxelSize: number;
  /** 격자 인덱스 → 월드 셀 중심 = (index - origin) * voxelSize */
  origin: V3;
  /** 정점 좌표에서 뺄 피벗(월드, m). 그룹 로컬 좌표로 만든다 */
  pivot: V3;
  /** 색 번호 1.. → 0..1 RGB (palette[번호-1]) */
  palette: readonly V3[];
  /** 가림 개수(0 = 완전 가림 .. 3 = 가림 없음) → 밝기 배율 */
  aoCurve: readonly [number, number, number, number];
  /** 정점색 배율 (로우폴리 캐릭터 exposure) */
  colorScale: number;
  /** true 면 면 하나의 AO 를 네 꼭짓점 평균(반올림) 한 값으로 통일 → 같은 색 면이 훨씬 잘 병합된다 (삼각형 예산용). false 면 꼭짓점별 AO(부드럽지만 병합 감소) */
  aoPerFace: boolean;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  quads: number;
}

const CORNERS_UV: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

type Include = (part: number, color: number) => boolean;

export const triangleCount = (m: Pick<MeshData, 'indices'>) => m.indices.length / 3;

/** 면 AO 4값(0..3): 가림 이웃 수 기반. (s1, s2, corner) */
export function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - (side1 ? 1 : 0) - (side2 ? 1 : 0) - (corner ? 1 : 0);
}

export function meshVoxels(g: VoxelGrid, include: Include, o: MeshOptions): MeshData {
  const { nx, ny, nz } = g;
  const dims = [nx, ny, nz];
  const at = (x: number, y: number, z: number) => (y * nz + z) * nx + x;
  const inb = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz;
  const sel = new Uint8Array(g.part.length);
  for (let i = 0; i < sel.length; i++) sel[i] = g.part[i] !== 0 && include(g.part[i], g.color[i]) ? 1 : 0;
  const selected = (x: number, y: number, z: number) => inb(x, y, z) && sel[at(x, y, z)] === 1;
  const solid = (x: number, y: number, z: number) => inb(x, y, z) && g.part[at(x, y, z)] !== 0;

  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  let quads = 0;
  const vs = o.voxelSize;
  const p3 = [0, 0, 0], q3 = [0, 0, 0];

  const emit = (a: number, s: number, d: number, u0: number, v0: number, w: number, h: number, color: number, ao: readonly number[]) => {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const rgb = o.palette[color - 1];
    // 면 평면 좌표(격자 모서리 좌표): 복셀 d 의 +면 = d+1, -면 = d
    const plane = s > 0 ? d + 1 : d;
    const corners: [number, number][] = [[u0, v0], [u0 + w, v0], [u0 + w, v0 + h], [u0, v0 + h]];
    const base = pos.length / 3;
    const order = s > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
    for (const ci of order) {
      const [cu, cv] = corners[ci];
      p3[a] = plane; p3[u] = cu; p3[v] = cv;
      // 모서리 좌표 → 월드: 셀 중심 = index - origin, 모서리 = 중심 - 0.5
      pos.push(
        (p3[0] - 0.5 - o.origin[0]) * vs - o.pivot[0],
        (p3[1] - 0.5 - o.origin[1]) * vs - o.pivot[1],
        (p3[2] - 0.5 - o.origin[2]) * vs - o.pivot[2],
      );
      q3[0] = q3[1] = q3[2] = 0; q3[a] = s;
      nor.push(q3[0], q3[1], q3[2]);
      const k = o.aoCurve[ao[ci]] * o.colorScale;
      col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    }
    // 대각선: AO 가 비대칭이면 어두운 쪽 대각선을 따라 자른다
    const a0 = ao[order[0]], a1 = ao[order[1]], a2 = ao[order[2]], a3 = ao[order[3]];
    if (a0 + a2 < a1 + a3) idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    quads++;
  };

  const co = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const nu = dims[u], nv = dims[v], na = dims[a];
    for (const s of [1, -1]) {
      const mask = new Int32Array(nu * nv);
      const aoPack = new Uint16Array(nu * nv); // 코너 4개 × 2비트
      const colMask = new Uint8Array(nu * nv);
      for (let d = 0; d < na; d++) {
        mask.fill(0);
        for (let iu = 0; iu < nu; iu++) {
          for (let iv = 0; iv < nv; iv++) {
            co[a] = d; co[u] = iu; co[v] = iv;
            if (!selected(co[0], co[1], co[2])) continue;
            const nb = [co[0], co[1], co[2]]; nb[a] += s;
            if (selected(nb[0], nb[1], nb[2])) continue;
            // AO: 면 바깥 층의 이웃. 코너 순서 = emit 의 corners (u0,v0),(u0+w,v0),(u0+w,v0+h),(u0,v0+h)
            let aoByCorner = CORNERS_UV.map(([su, sv]) => {
              const c1 = [nb[0], nb[1], nb[2]]; c1[u] += su;
              const c2 = [nb[0], nb[1], nb[2]]; c2[v] += sv;
              const c3 = [nb[0], nb[1], nb[2]]; c3[u] += su; c3[v] += sv;
              return vertexAO(solid(c1[0], c1[1], c1[2]), solid(c2[0], c2[1], c2[2]), solid(c3[0], c3[1], c3[2]));
            });
            if (o.aoPerFace) {
              const avg = Math.round(aoByCorner.reduce((x, y) => x + y, 0) / 4);
              aoByCorner = [avg, avg, avg, avg];
            }
            const uniform = aoByCorner.every((x) => x === aoByCorner[0]);
            const color = g.color[at(co[0], co[1], co[2])];
            const cell = iu * nv + iv;
            colMask[cell] = color;
            aoPack[cell] = aoByCorner[0] | (aoByCorner[1] << 2) | (aoByCorner[2] << 4) | (aoByCorner[3] << 6);
            // 균일 AO: 병합 가능 키(색 + AO). 비균일: 셀마다 유일한 키(병합 불가)
            mask[cell] = uniform ? (color | (aoByCorner[0] << 8) | 0x10000) : -(cell + 1);
          }
        }
        // 그리디: u 방향으로 늘린 뒤 v 방향으로 같은 폭만큼 늘린다
        for (let iu = 0; iu < nu; iu++) {
          for (let iv = 0; iv < nv;) {
            const key = mask[iu * nv + iv];
            if (key === 0) { iv++; continue; }
            let w = 1;
            if (key > 0) while (iu + w < nu && mask[(iu + w) * nv + iv] === key) w++;
            let h = 1;
            if (key > 0) {
              outer: while (iv + h < nv) {
                for (let k = 0; k < w; k++) if (mask[(iu + k) * nv + iv + h] !== key) break outer;
                h++;
              }
            }
            const pk = aoPack[iu * nv + iv];
            const ao = [pk & 3, (pk >> 2) & 3, (pk >> 4) & 3, (pk >> 6) & 3];
            const color = colMask[iu * nv + iv];
            emit(a, s, d, iu, iv, w, h, color, ao);
            for (let du = 0; du < w; du++) for (let dv = 0; dv < h; dv++) mask[(iu + du) * nv + iv + dv] = 0;
            iv += h;
          }
        }
      }
    }
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: new Uint32Array(idx),
    quads,
  };
}
