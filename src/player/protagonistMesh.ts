import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import {
  BACK_HAIR, CHEST, CROWN_SPIKES, FACE_TEX, FOREARM, FRINGE, FRINGE_BASE, HEAD, NOSE, PCOL, SHIN, THIGH, TORSO, UPPER_ARM, WATCH, WATCH_FACE,
  type BoxSpec, type GroupSpec, type LoftSpec,
} from '../data/protagonist';
import { MeshBuilder, smoothRings, type ShadeOpts, type V3 } from '../render/meshBuilder';

/**
 * 주인공 지오메트리 (순수 THREE 지오메트리 — canvas 없이 테스트 가능).
 * 관절 그룹마다 채널별로 하나의 지오메트리로 병합한다: cloth(천 텍스처 × 정점색) / plain(정점색만) / face(얼굴 텍스처).
 * 사양은 data/protagonist.ts.
 */
export interface GroupGeo { cloth?: THREE.BufferGeometry; plain?: THREE.BufferGeometry; face?: THREE.BufferGeometry }
export interface ProtagonistGeometry {
  torso: GroupGeo; chest: GroupGeo; head: GroupGeo;
  thigh: { R: GroupGeo; L: GroupGeo }; shin: { R: GroupGeo; L: GroupGeo };
  upperArm: { R: GroupGeo; L: GroupGeo }; forearm: { R: GroupGeo; L: GroupGeo };
  /** 전체 삼각형 수 */
  triangles: number;
}

const L = VISUAL.character.look;

function defaultShade(exposure: number): ShadeOpts { return { exposure, jitter: L.faceJitter, seed: L.seed }; }

interface Builders { cloth: MeshBuilder; plain: MeshBuilder; face: MeshBuilder }

const mirrorMatrix = (side: 1 | -1) => new THREE.Matrix4().makeScale(side, 1, 1);

function loftMatrix(l: LoftSpec, side: 1 | -1): THREE.Matrix4 {
  // 순서: (축 눕힘 rotX) → (회전 z) → (이동) → 미러
  const m = new THREE.Matrix4();
  if (l.pos) m.makeTranslation(...l.pos);
  const rz = new THREE.Matrix4().makeRotationZ(l.rotZ ?? 0);
  const rx = new THREE.Matrix4().makeRotationX(l.rotX ?? 0);
  m.multiply(rz).multiply(rx);
  return mirrorMatrix(side).multiply(m);
}

/** 얼굴 정면 투영 UV (머리 로컬 x,y → 텍스처 u,v) */
function faceUV(x: number, y: number): [number, number] {
  const w = FACE_TEX.srcWidthPx * FACE_TEX.mPerPx, h = FACE_TEX.srcHeightPx * FACE_TEX.mPerPx;
  return [x / w + 0.5, (y - FACE_TEX.chinY) / h];
}

function buildGroup(spec: GroupSpec, b: Builders, side: 1 | -1, extra: { head?: boolean } = {}) {
  for (const l of spec.lofts) {
    if (l.onlySide && l.onlySide !== side) continue;
    for (const s of l.mirror ? [side, -side] as (1 | -1)[] : [side]) {
      const target = l.channel === 'cloth' ? b.cloth : b.plain;
      target.setMatrix(loftMatrix(l, s));
      b.face.setMatrix(loftMatrix(l, s));
      const isSkull = extra.head && l.name === 'skull';
      target.loft(l.smooth ? smoothRings(l.rings, l.smooth) : l.rings, {
        sides: l.sides, offsetDeg: l.offsetDeg, capBottom: l.capBottom, capTop: l.capTop, innerAO: l.innerAO, jitter: l.jitter,
        uvTile: l.channel === 'cloth' ? L.fabricTile : 0,
        // 두개골 정면 5면 × 얼굴 링 구간 → 얼굴 채널 (k = 9,10,11,0,1: 앞쪽 6정점 사이)
        pick: isSkull ? (ri, k) => ri < FACE_TEX.faceRingMax && (k >= 9 || k <= 1) : undefined,
        altUV: isSkull ? (x, y) => faceUV(x, y) : undefined,
      }, isSkull ? b.face : undefined);
    }
  }
  for (const bx of spec.boxes) addBox(b, bx, side);
}

function addBox(b: Builders, bx: BoxSpec, side: 1 | -1) {
  if (bx.onlySide && bx.onlySide !== side) return;
  for (const s of bx.mirror ? [side, -side] as (1 | -1)[] : [side]) {
    const t = bx.channel === 'cloth' ? b.cloth : b.plain;
    t.setMatrix(mirrorMatrix(s));
    // 미러는 방출 행렬이 처리한다 (회전도 거울상이 된다)
    t.box(bx.size, bx.pos, bx.color, { rot: bx.rot, ao: bx.ao, taperTop: bx.taperTop, uvTile: bx.channel === 'cloth' ? L.fabricTile : 0 });
  }
}

const finish = (b: Builders): GroupGeo => ({
  cloth: b.cloth.triangles ? b.cloth.build() : undefined,
  plain: b.plain.triangles ? b.plain.build() : undefined,
  face: b.face.triangles ? b.face.build() : undefined,
});
const tris = (g: GroupGeo) => [g.cloth, g.plain, g.face].reduce((n, x) => n + (x ? x.attributes.position.count / 3 : 0), 0);

/** 머리: 두개골(얼굴 면 분리) + 코 쐐기 + 앞머리 가닥 */
function buildHead(exposure: number): GroupGeo {
  const b: Builders = { cloth: new MeshBuilder(defaultShade(exposure)), plain: new MeshBuilder(defaultShade(exposure)), face: new MeshBuilder(defaultShade(exposure)) };
  buildGroup(HEAD, b, 1, { head: true });
  // 코 (얼굴 채널): 윗끝 T, 코끝 P, 좌 L, 우 R
  b.face.setMatrix(null);
  const [T, P, Lf, Rt] = NOSE;
  b.face.fan([
    { v: [T, Lf, P], hint: [-1, 0, -1] },
    { v: [T, P, Rt], hint: [1, 0, -1] },
    { v: [P, Lf, Rt], hint: [0, -1, -0.3] },
  ], faceUV);
  // 앞머리 가닥
  b.plain.setMatrix(null);
  for (const f of FRINGE) {
    const base: [V3, V3, V3] = [
      [f.x - f.w / 2, FRINGE_BASE.y, FRINGE_BASE.z], [f.x + f.w / 2, FRINGE_BASE.y, FRINGE_BASE.z], [f.x, FRINGE_BASE.y + 0.012, FRINGE_BASE.z + 0.03],
    ];
    b.plain.pyramid(base, [f.x, f.tipY, f.tipZ], PCOL.hair, [0.85, 1]);
  }
  // 윗머리 결
  for (const c of CROWN_SPIKES) {
    const y0 = 0.262;
    b.plain.pyramid([[c.x - c.w / 2, y0, c.z], [c.x + c.w / 2, y0, c.z], [c.x, y0, c.z + c.w * 0.8]], [c.x, c.tipY, c.tipZ], PCOL.hairLight, [0.9, 1]);
  }
  // 뒤통수 아랫머리
  for (const h of BACK_HAIR) {
    b.plain.pyramid([[h.x - h.w / 2, h.y, 0.108], [h.x + h.w / 2, h.y, 0.108], [h.x, h.y + 0.014, 0.12]], [h.x, h.y - 0.05, 0.13], PCOL.hair, [0.8, 1]);
  }
  return finish(b);
}

function buildSimple(spec: GroupSpec, side: 1 | -1, exposure: number, extraBoxes: readonly BoxSpec[] = []): GroupGeo {
  const b: Builders = { cloth: new MeshBuilder(defaultShade(exposure)), plain: new MeshBuilder(defaultShade(exposure)), face: new MeshBuilder(defaultShade(exposure)) };
  buildGroup(spec, b, side);
  for (const bx of extraBoxes) addBox(b, bx, side);
  return finish(b);
}

/** 모든 관절 그룹의 지오메트리를 만든다. exposure = 알베도 배율 (VISUAL.lowpoly.character.exposure 등) */
export function buildProtagonistGeometry(exposure: number): ProtagonistGeometry {
  const torso = buildSimple(TORSO, 1, exposure);
  const chest = buildSimple(CHEST, 1, exposure);
  const head = buildHead(exposure);
  const both = <T>(f: (s: 1 | -1) => T) => ({ R: f(1), L: f(-1) });
  const thigh = both((s) => buildSimple(THIGH, s, exposure));
  const shin = both((s) => buildSimple(SHIN, s, exposure));
  const upperArm = both((s) => buildSimple(UPPER_ARM, s, exposure));
  const forearm = both((s) => buildSimple(FOREARM, s, exposure, [WATCH, WATCH_FACE]));
  const all = [torso, chest, head, thigh.R, thigh.L, shin.R, shin.L, upperArm.R, upperArm.L, forearm.R, forearm.L];
  return { torso, chest, head, thigh, shin, upperArm, forearm, triangles: all.reduce((n, g) => n + tris(g), 0) };
}
