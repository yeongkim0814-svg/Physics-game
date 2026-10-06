import * as THREE from 'three';
import type { MobDef } from '../core/types';
import { COL, CUES, lambert } from '../render/palette';

export interface MobModel {
  group: THREE.Group;
  /** 피격 섬광/예고 연출 대상 재질과 기본 발광색 */
  bodyMats: { mat: THREE.MeshLambertMaterial; base: THREE.Color }[];
  eyeMats: THREE.MeshLambertMaterial[];
}

/**
 * 로우폴리 몹 모델 (원점 = 발). 종류는 실루엣으로 구분하고, 모두 붉은 눈(적 기능색)으로 어두운 곳에서도 식별된다.
 *  금속: 키 크고 각진 로봇 + 청록 안테나(전도체 단서) / 절연: 낮고 둥근 몸통 + 줄무늬 / 일반: 사람형
 */
export function buildMobModel(def: MobDef): MobModel {
  const group = new THREE.Group();
  const bodyMats: MobModel['bodyMats'] = [];
  const eyeMats: THREE.MeshLambertMaterial[] = [];

  const part = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, emissive = 0) => {
    const mat = lambert(color, { emissive });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    bodyMats.push({ mat, base: new THREE.Color(emissive) });
    return m;
  };
  const eyes = (y: number, z: number, spread: number) => {
    for (const sx of [-1, 1]) {
      const mat = lambert(0x000000, { emissive: CUES.enemy });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.05), mat);
      m.position.set(sx * spread, y, z);
      group.add(m);
      eyeMats.push(mat);
    }
  };
  /** 몸통을 두른 적 표시 띠 (기능색 red). 어느 방향에서도, 어두운 곳/올리브 배경에서도 적을 식별하고 공격 예고 때 밝아진다 */
  const band = (geo: THREE.BufferGeometry, y: number) => {
    const mat = lambert(0x000000, { emissive: CUES.enemy });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    group.add(m);
    eyeMats.push(mat);
  };
  const dim = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

  if (def.id === 'metal') {
    part(new THREE.BoxGeometry(0.7, 0.85, 0.45), def.color, 0, 1.0, 0, dim(CUES.conductor, 0.22));
    part(new THREE.BoxGeometry(0.38, 0.32, 0.34), def.color, 0, 1.58, 0, dim(CUES.conductor, 0.22));
    for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.22, 0.6, 0.25), COL.copperDark, sx * 0.18, 0.3, 0);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), CUES.conductor, 0, 1.95, 0, CUES.conductor);
    band(new THREE.BoxGeometry(0.76, 0.1, 0.51), 1.2);
    eyes(1.6, -0.18, 0.1);
  } else if (def.id === 'insulator') {
    part(new THREE.CylinderGeometry(0.5, 0.55, 0.9, 6), def.color, 0, 0.5, 0);
    part(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 6), COL.stone, 0, 0.3, 0);
    part(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 6), COL.stone, 0, 0.75, 0);
    part(new THREE.IcosahedronGeometry(0.3, 0), def.color, 0, 1.25, 0);
    band(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 6), 0.52);
    eyes(1.28, -0.26, 0.12);
  } else {
    part(new THREE.BoxGeometry(0.6, 0.75, 0.4), def.color, 0, 0.95, 0);
    part(new THREE.IcosahedronGeometry(0.27, 0), COL.shade, 0, 1.5, 0);
    for (const sx of [-1, 1]) {
      part(new THREE.BoxGeometry(0.22, 0.58, 0.25), COL.shade, sx * 0.16, 0.29, 0);
      part(new THREE.BoxGeometry(0.15, 0.6, 0.15), def.color, sx * 0.42, 0.95, 0);
    }
    band(new THREE.BoxGeometry(0.66, 0.1, 0.46), 1.15);
    eyes(1.52, -0.22, 0.1);
  }
  return { group, bodyMats, eyeMats };
}
