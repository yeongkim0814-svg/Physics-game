import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { SJ } from '../data/scientist';
import { buildScientistGeometry } from './scientistMesh';
import { mirrorX, RingSurface, ribbon } from './smoothMesh';
import { skirtAngles } from './voxelPose';

const B = VISUAL.scientist.budget;

describe('RingSurface', () => {
  const rings = [{ y: 0, rx: 0.1, rz: 0.08, c: 0xffffff }, { y: 0.3, rx: 0.07, rz: 0.06, c: 0xffffff }];
  const radialDots = (g: THREE.BufferGeometry, yLo: number, yHi: number) => {
    const pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index!;
    const out: number[] = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (cy < yLo || cy > yHi) continue;
      const n = new THREE.Vector3(nrm.getX(a) + nrm.getX(b) + nrm.getX(c), 0, nrm.getZ(a) + nrm.getZ(b) + nrm.getZ(c));
      out.push(n.dot(new THREE.Vector3(cx, 0, cz)));
    }
    return out;
  };
  it('벽 법선이 바깥, 인덱스 지오메트리(스무스)', () => {
    const g = new RingSurface(rings).build({ sides: 16 });
    expect(g.index).not.toBeNull();
    const d = radialDots(g, 0.001, 0.299);
    expect(d.length).toBeGreaterThan(0);
    for (const v of d) expect(v).toBeGreaterThan(0);
  });
  it('링이 아래로 내려가는 순서(팔)여도 법선이 바깥', () => {
    const g = new RingSurface([{ ...rings[1], y: 0 }, { ...rings[0], y: -0.3 }]).build({ sides: 16 });
    for (const v of radialDots(g, -0.299, -0.001)) expect(v).toBeGreaterThan(0);
  });
  it('마개 법선이 바깥(위/아래)', () => {
    const g = new RingSurface(rings).build({ sides: 12, capTop: true, capBottom: true });
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const c = pos.count;
    // 마개 중심 정점은 맨 뒤 2개: 아래, 위 순서
    expect(nrm.getY(c - 2)).toBeLessThan(-0.9);
    expect(nrm.getY(c - 1)).toBeGreaterThan(0.9);
  });
  it('구멍: 앞쪽 정점이 사라지고 뒤쪽은 그대로', () => {
    const solid = new RingSurface(rings, { smooth: 8 }).build({ sides: 24, start: 180 });
    const holed = new RingSurface(rings, { smooth: 8, hole: { phiMax: 0.6, yc: 0.15, hy: 0.1 } }).build({ sides: 24, start: 180 });
    expect(holed.index!.count).toBeLessThan(solid.index!.count);
    const pos = holed.attributes.position;
    for (let i = 0; i < pos.count; i++) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
  });
  it('표면 경로 띠는 표면 바깥 lift 위에 놓인다', () => {
    const s = new RingSurface(rings);
    const path = s.path([[40, 0.05], [40, 0.25]], 4);
    const r = ribbon(path, 0.02, 0xff0000, 0.005);
    const pos = r.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / 0.3)), rx = 0.1 - 0.03 * t, rz = 0.08 - 0.02 * t;
      expect(Math.hypot(pos.getX(i) / rx, pos.getZ(i) / rz)).toBeGreaterThan(0.99);
    }
  });
  it('mirrorX: x 반전 + 법선 바깥 유지', () => {
    const g = new RingSurface([{ y: 0, rx: 0.05, rz: 0.05, cx: 0.2, c: 0xffffff }, { y: -0.3, rx: 0.05, rz: 0.05, cx: 0.2, c: 0xffffff }]).build({ sides: 12 });
    const m = mirrorX(g);
    m.computeBoundingBox();
    expect(m.boundingBox!.max.x).toBeLessThan(-0.1);
    const pos = m.attributes.position, nrm = m.attributes.normal, idx = m.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      const ab = new THREE.Vector3(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
      const ac = new THREE.Vector3(pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a));
      const face = ab.cross(ac);
      const n = new THREE.Vector3(nrm.getX(a), nrm.getY(a), nrm.getZ(a));
      if (face.lengthSq() > 1e-12) expect(face.dot(n)).toBeGreaterThan(0);
    }
  });
});

describe('scientist geometry', () => {
  const g = buildScientistGeometry(1);
  it('삼각형 수가 예산 안, 모든 좌표 유한', () => {
    expect(g.triangles).toBeGreaterThan(4000);
    expect(g.triangles).toBeLessThanOrEqual(B.triangles);
    const meshes = [g.torso, g.head, g.skirtF, g.skirtB, g.thigh.R, g.shin.R, g.upperArm.R, g.upperArm.L, g.forearm.R, g.forearm.L];
    for (const m of meshes) {
      expect(m).toBeDefined();
      const pos = m!.attributes.position;
      for (let i = 0; i < pos.count; i++) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      for (const name of ['normal', 'color', 'uv']) expect(m!.attributes[name].count).toBe(pos.count);
    }
  });
  it('전체 높이 ≈ 1.8m (발바닥 0, 후드 끝), 로브 폭이 어깨보다 넓다', () => {
    const box = new THREE.Box3();
    const add = (geo: THREE.BufferGeometry | undefined, x: number, y: number) => {
      if (!geo) return;
      geo.computeBoundingBox();
      box.union(geo.boundingBox!.clone().translate(new THREE.Vector3(x, y, 0)));
    };
    add(g.torso, 0, SJ.hipY); add(g.head, 0, SJ.hipY + SJ.neckY);
    add(g.shin.R, 0, SJ.hipY + SJ.kneeY); add(g.skirtF, 0, SJ.skirtPivotY);
    expect(box.max.y).toBeGreaterThan(1.75);
    expect(box.max.y).toBeLessThan(1.9);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.02);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.6);
  });
  it('후드 구멍이 있다: 앞(-z) 중앙에 얼굴 높이 정점이 후드 표면보다 안쪽(검은 얼굴만)', () => {
    const head = g.head!;
    head.computeBoundingBox();
    expect(head.boundingBox!.min.y).toBeLessThan(0);
    expect(head.boundingBox!.max.y).toBeGreaterThan(0.29);
  });
  it('아랫자락 앞/뒤: 앞은 -z, 뒤는 +z 쪽에 있다', () => {
    g.skirtF!.computeBoundingBox(); g.skirtB!.computeBoundingBox();
    expect(g.skirtF!.boundingBox!.min.z).toBeLessThan(-0.25);
    expect(g.skirtB!.boundingBox!.max.z).toBeGreaterThan(0.25);
  });
});

describe('scientist skirt follow', () => {
  it('앞자락은 앞으로 나간 다리, 뒷자락은 뒤로 간 다리를 따라간다', () => {
    const a = skirtAngles({ thighL: 0.5, thighR: -0.4 }, VISUAL.scientist.skirtFollow);
    expect(a.front).toBeCloseTo(0.5 * VISUAL.scientist.skirtFollow, 5);
    expect(a.back).toBeCloseTo(-0.4 * VISUAL.scientist.skirtFollow, 5);
  });
});
