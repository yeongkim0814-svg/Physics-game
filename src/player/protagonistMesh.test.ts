import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshBuilder } from '../render/meshBuilder';
import { buildProtagonistGeometry } from './protagonistMesh';

const shade = { exposure: 1, jitter: 0, seed: 1 };

describe('MeshBuilder', () => {
  it('로프트: 모든 벽 삼각형 법선이 바깥(원통 중심 반대)을 향한다, 미러 행렬에서도', () => {
    for (const mirror of [false, true]) {
      const b = new MeshBuilder(shade);
      if (mirror) b.setMatrix(new THREE.Matrix4().makeScale(-1, 1, 1));
      b.loft(
        [{ y: 0, rx: 0.1, rz: 0.08, c: 0xffffff }, { y: 0.3, rx: 0.07, rz: 0.06, c: 0xffffff }],
        { sides: 8, offsetDeg: 22.5, capBottom: true, capTop: true },
      );
      const g = b.build();
      const pos = g.attributes.position, nrm = g.attributes.normal;
      for (let i = 0; i < pos.count; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        const out = new THREE.Vector3(cx, 0, cz);
        const n = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        if (cy > 0.001 && cy < 0.299) expect(n.dot(out)).toBeGreaterThan(0); // 벽
        else expect(Math.abs(n.y)).toBeGreaterThan(0.9);                        // 캡
      }
    }
  });
  it('박스는 12 삼각형, 법선이 중심 바깥', () => {
    const b = new MeshBuilder(shade);
    b.box([0.2, 0.4, 0.1], [0.5, 0, 0], 0xff0000, { rot: [0.3, 0.5, 0.1] });
    expect(b.triangles).toBe(12);
    const g = b.build();
    const pos = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i += 3) {
      const c = new THREE.Vector3().set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)));
      c.divideScalar(3).sub(new THREE.Vector3(0.5, 0, 0));
      expect(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).dot(c)).toBeGreaterThan(0);
    }
  });
});

describe('protagonist geometry', () => {
  const g = buildProtagonistGeometry(1);
  it('캐릭터 몸 삼각형 1,500~3,000 (장치 제외)', () => {
    expect(g.triangles).toBeGreaterThan(1500);
    expect(g.triangles).toBeLessThanOrEqual(2800); // 장치 약 60 + 여유를 두고 3,000 이하
  });
  it('얼굴 채널 UV 는 얼굴 텍스처 범위(0..1) 안', () => {
    const uv = g.head.face!.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-0.02);
      expect(uv.getX(i)).toBeLessThanOrEqual(1.02);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-0.02);
      expect(uv.getY(i)).toBeLessThanOrEqual(1.02);
    }
  });
  it('몸 전체 높이 ≈ 1.8m, 좌우 폭은 어깨가 넓다', () => {
    const box = new THREE.Box3();
    const add = (geo?: THREE.BufferGeometry, y = 0) => { if (!geo) return; geo.computeBoundingBox(); const b = geo.boundingBox!.clone(); b.translate(new THREE.Vector3(0, y, 0)); box.union(b); };
    add(g.head.plain, 0.93 + 0.595); add(g.head.face, 0.93 + 0.595);
    add(g.shin.R.plain, 0.93 - 0.45); // 부츠 바닥
    expect(box.max.y).toBeGreaterThan(1.75);
    expect(box.max.y).toBeLessThan(1.86);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.02);
  });
});
