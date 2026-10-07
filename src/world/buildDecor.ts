import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LP } from '../render/style';
import { MAP } from '../data/map';
import { createMaterial } from '../render/materials';
import { inFootprint, scatter } from './decor';
import type { TerrainField } from './terrain/terrainField';

const D = LP.decor;

/** 인스턴스 하나의 행렬: 위치·y축 회전·비균등 스케일 */
const matrix = (x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz));

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: { m: THREE.Matrix4; c: number }[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  const col = new THREE.Color();
  items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, col.setHex(it.c)); });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // 인스턴스가 넓게 퍼져 있어 바운딩 구가 부정확하다 (삼각형 수가 작아 비용 무시)
  return mesh;
}

/** 납작한 원판 장식이 굴곡 위에서 묻히지 않도록 중심과 둘레 4점 중 가장 높은 지면 */
const groundMax = (field: TerrainField, x: number, z: number, r: number) =>
  Math.max(field.groundY(x, z), field.groundY(x + r, z), field.groundY(x - r, z), field.groundY(x, z + r), field.groundY(x, z - r));

const lerpColor = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

/** 점 (x,z) 가 평평한 칸 안쪽인가: 주변 r m 4방향이 같은 높이 (절벽 모서리·벽 위에 장식이 걸치지 않게) */
export function isFlatSpot(field: TerrainField, x: number, z: number, r: number) {
  // 고원 바깥은 연속 삼각 격자라 계단 칸 비교가 의미 없다: 실제 지면 경사로 판정 (반경 r 안 네 방향 기울기 ≤ 0.35)
  if (Math.max(Math.abs(x), Math.abs(z)) >= field.P.outer.seam - r) {
    const h0 = field.groundY(x, z);
    if (!Number.isFinite(h0)) return false;
    return [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => Math.abs(field.groundY(x + dx, z + dz) - h0) <= r * 0.35);
  }
  const h = field.levelAt(x, z);
  if (h === null) return false;
  return [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => field.levelAt(x + dx, z + dz) === h);
}

/**
 * 시각 전용 장식 (충돌 없음, 'lowpoly' 전용). 평평한 지면의 밋밋함을 줄이고 안개 원근의 깊이 단서를 준다.
 * 모든 배치 높이는 실제 지면 높이(`field.groundY` = 계단형 윗면 + 고원 굴곡 + 바깥 변위)를 따른다.
 * - 고원 바깥(보이지 않는 외곽 벽 너머): 나무·바위를 평평한 칸 위에 (계곡 바닥·메사 윗면 등, 플레이어가 닿을 수 없어 충돌 불필요)
 * - 맵 안: 이끼 초록 패치(고원·낮은 블록 윗면), 물 빠진 협곡 바닥의 청록 잔물 (전도체 아님 — MAP.water 는 비어 있다)
 * 인스턴싱으로 전체 6~8 드로우콜.
 */
export function buildDecor(scene: THREE.Scene, field: TerrainField) {
  const rect = (b: { pos: readonly number[]; size: readonly number[] }) => ({ c: [b.pos[0], b.pos[2]] as const, s: [b.size[0], b.size[2]] as const });
  const blocks = MAP.blocks.map(rect);
  const outside = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > MAP.size / 2;
  const flatOutside = (x: number, z: number) => !(outside(x, z) && isFlatSpot(field, x, z, 6));

  // --- 고원 바깥 ---
  const treeMat = createMaterial(0xffffff);
  const crown = mergeGeometries([
    new THREE.ConeGeometry(1.0, 1.9, 6).translate(0, 1.7, 0),
    new THREE.ConeGeometry(0.72, 1.6, 6).translate(0, 2.7, 0),
  ])!;
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.0, 5).translate(0, 0.5, 0);
  const trees = scatter(D.seed, D.trees, D.treeRange, flatOutside);
  const tScale = (r: number) => 1.4 + r * 1.4; // 나무 크기 계수 (전체 높이 ≈ 3.5×)
  scene.add(instanced(trunk, treeMat, trees.map((p) => {
    const t = tScale(p.r[0]);
    return { m: matrix(p.x, field.groundY(p.x, p.z), p.z, p.r[2] * 6.28, t * 0.9, t * 1.1, t * 0.9), c: D.treeTrunk };
  })));
  scene.add(instanced(crown, treeMat, trees.map((p) => {
    const t = tScale(p.r[0]);
    return { m: matrix(p.x, field.groundY(p.x, p.z), p.z, p.r[2] * 6.28, t * 0.85, t, t * 0.85), c: lerpColor(D.treeCrown, D.treeCrown2, p.r[1]) };
  })));

  const rocks = scatter(D.seed + 1, D.rocks, [88, 300], flatOutside);
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), createMaterial(0xffffff), rocks.map((p) => {
    const s = 0.8 + p.r[0] * 2.6;
    return { m: matrix(p.x, field.groundY(p.x, p.z) + s * 0.25, p.z, p.r[2] * 6.28, s, s * 0.65, s * 0.85), c: lerpColor(D.rock, 0xa6a3a8, p.r[1] * 0.6) };
  })));

  // --- 맵 안 이끼 패치 (납작한 7각형. 깊이 정밀도 때문에 polygonOffset 으로 지면 위에 확실히 그린다) ---
  const decalGeo = new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2);
  const decalMat = createMaterial(0xffffff);
  decalMat.polygonOffset = true;
  decalMat.polygonOffsetFactor = -2;
  decalMat.polygonOffsetUnits = -2;
  const half = MAP.size / 2 - 3;
  const cz: [number, number] = [MAP.canyon.zMin, MAP.canyon.zMax];
  const lift = 0.04;
  const moss = scatter(D.seed + 3, D.mossPatches, [0, half], (x, z) =>
    z > cz[0] - 3 && z < cz[1] + 3 || blocks.some((b) => inFootprint(x, z, b.c, b.s, 1.5)) || inFootprint(x, z, [-30, -52], [14, 14], 6) || inFootprint(x, z, [MAP.spawn[0], MAP.spawn[2]], [0, 0], 9)
    || !isFlatSpot(field, x, z, 3));
  const decals = moss.map((p) => {
    const s = 0.7 + p.r[0] * 1.4;
    return { m: matrix(p.x, groundMax(field, p.x, p.z, s * 1.4) + lift, p.z, p.r[2] * 6.28, s, 1, s * (0.7 + p.r[1] * 0.4)), c: lerpColor(D.mossColor, D.mossColor2, p.r[1]) };
  });
  // 낮은 블록(윗면 3m 이하) 위에도 이끼 한 점씩
  const lowBlocks = MAP.blocks.filter((b) => b.pos[1] + b.size[1] / 2 <= 6 && b.size[0] > 3 && b.size[2] > 3 && b.pos[1] > 0);
  lowBlocks.forEach((b, i) => {
    const s = Math.min(b.size[0], b.size[2]) * 0.28;
    decals.push({ m: matrix(b.pos[0] + b.size[0] * (((i * 37) % 7) / 7 - 0.5) * 0.5, b.pos[1] + b.size[1] / 2 + lift, b.pos[2], i, s, 1, s), c: lerpColor(D.mossColor, D.mossColor2, (i % 5) / 5) });
  });
  // 협곡 바닥 청록 잔물
  const floorY = -MAP.canyon.depth + lift;
  const pud = scatter(D.seed + 4, D.puddles, [0, 70], (x, z) => z < cz[0] + 1.5 || z > cz[1] - 1.5 || blocks.some((b) => inFootprint(x, z, b.c, b.s, 1)));
  pud.forEach((p) => {
    const s = 1.0 + p.r[0] * 2.2;
    decals.push({ m: matrix(p.x, floorY, p.z, p.r[2] * 6.28, s * 1.5, 1, s), c: D.puddleColor });
  });
  scene.add(instanced(decalGeo, decalMat, decals));
}
