import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VISUAL } from '../config/settings';
import { MAP } from '../data/map';
import { createMaterial } from '../render/materials';
import { LP } from '../render/style';
import { isFlatSpot } from './buildDecor';
import { scatter } from './decor';
import type { TerrainField } from './terrain/terrainField';

/** 모듈 하나의 지오메트리: 원점 = 바닥 중앙, 위쪽 +y. 박스만 조합한다 (단순 모듈식 건축, G5) */
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export const MODULE_KINDS = {
  /** 높은 기둥: 몸통 + 머리 + 첨탑 */
  pylon: () => mergeGeometries([box(2.4, 16, 2.4, 0, 0, 0), box(3.4, 1.2, 3.4, 0, 16, 0), box(0.7, 5, 0.7, 0, 17.2, 0)])!,
  /** 문(아치형 게이트): 기둥 2 + 상인방 */
  arch: () => mergeGeometries([box(3, 11, 3, -5.2, 0, 0), box(3, 11, 3, 5.2, 0, 0), box(13.4, 3, 3.4, 0, 11, 0)])!,
  /** 낮은 패널 벽: 슬랩 + 위 턱 + 부벽 2 */
  wall: () => mergeGeometries([box(18, 6, 1.8, 0, 0, 0), box(18.6, 0.9, 2.6, 0, 6, 0), box(2, 7, 3.2, -6, 0, 0), box(2, 7, 3.2, 6, 0, 0)])!,
};
export type ModuleKind = keyof typeof MODULE_KINDS;
const KIND_LIST = Object.keys(MODULE_KINDS) as ModuleKind[];

/**
 * 기술 모듈 키트 (G5 + G9, 시각 전용·충돌 없음): 기둥·아치·벽을 인스턴싱으로 고원 바깥 평탄한 곳에 흩뿌리고,
 * 허공에 떠 있는 팔각 링 몇 개를 얹는다. 표면은 'tech' 텍스처(회로선 발광 = 청록 장식광, 정적·약함).
 * 큰 실루엣을 만들어 안개 너머 원근을 살린다. 인스턴스 색은 LP.techColors 에서 고른다.
 */
export function buildTechModules(scene: THREE.Scene, field: TerrainField) {
  const M = VISUAL.lowpoly.tech.modules, X = VISUAL.lowpoly.texture;
  const mat = createMaterial(0xffffff, {
    tex: { top: 'tech', side: 'tech', tile: X.techTile, amp: X.amp, glow: VISUAL.lowpoly.tech.decorGlow },
  });
  const outside = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > MAP.size / 2;
  const pts = scatter(M.seed, M.count, M.range, (x, z) => !(outside(x, z) && isFlatSpot(field, x, z, 9)));
  const color = (r: number) => LP.techColors[Math.floor(r * LP.techColors.length) % LP.techColors.length];
  const groups = new Map<ModuleKind, THREE.Matrix4[]>(KIND_LIST.map((k) => [k, []]));
  const colors = new Map<ModuleKind, number[]>(KIND_LIST.map((k) => [k, []]));
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const p of pts) {
    const kind = KIND_LIST[Math.floor(p.r[0] * KIND_LIST.length) % KIND_LIST.length];
    const s = 1.1 + p.r[1] * 0.9;
    groups.get(kind)!.push(new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, field.surface(p.x, p.z), p.z), q.setFromAxisAngle(up, Math.round(p.r[2] * 4) * (Math.PI / 2) + (p.r[1] - 0.5) * 0.3), new THREE.Vector3(s, s, s)));
    colors.get(kind)!.push(color(p.r[1]));
  }
  // 떠 있는 팔각 링: 일부 기둥/아치 위치 위에 세로로 세운다
  const ringGeo = new THREE.TorusGeometry(7, 0.9, 4, 8);
  const rings: THREE.Matrix4[] = [], ringColors: number[] = [];
  pts.slice(0, M.rings).forEach((p, i) => {
    rings.push(new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, field.surface(p.x, p.z) + 34 + i * 6, p.z), q.setFromAxisAngle(up, p.r[2] * Math.PI), new THREE.Vector3(1 + p.r[0], 1 + p.r[0], 1 + p.r[0])));
    ringColors.push(color(p.r[2]));
  });

  const add = (geo: THREE.BufferGeometry, ms: THREE.Matrix4[], cs: number[]) => {
    if (!ms.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, ms.length);
    const c = new THREE.Color();
    ms.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setHex(cs[i])); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  };
  for (const k of KIND_LIST) add(MODULE_KINDS[k](), groups.get(k)!, colors.get(k)!);
  add(ringGeo, rings, ringColors);
  return { placed: pts.length, rings: rings.length };
}
