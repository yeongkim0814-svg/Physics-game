import * as THREE from 'three';
import { lambert } from '../render/palette';
import { VISUAL } from '../config/settings';
import {
  CHEST, FOREARM_PARTS, HEAD_PARTS, JOINTS, SHIN_PARTS, THIGH_PARTS, TORSO_PARTS, UPPER_ARM_PARTS,
  type PartSpec, type TexFace, type TexId,
} from '../data/protagonist';
import { followFactor } from './cameraMath';
import type { CharacterModel, CharacterState } from './CharacterModel';
import { createHeldDevice } from './heldDevice';
import { advancePhase, blendPose, REST_POSE, targetPose } from './protagonistPose';
import { protagonistTexture } from './protagonistTextures';

const V = VISUAL.character;
/** BoxGeometry 재질 순서: +X, -X, +Y, -Y, +Z, -Z */
const FACE_SLOT: Record<TexFace, number> = { right: 0, left: 1, top: 2, back: 4, front: 5 };

const matCache = new Map<string, THREE.Material>();
/** 색 × k (발광색용) */
const scaleHex = (hex: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((hex >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const plainMat = (color: number, glow = 0) => {
  const key = `c${color}:${glow}`;
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = lambert(color, { emissive: scaleHex(color, glow) })));
  return m;
};
/** 텍스처 재질: emissiveMap 으로 텍스처 색 그대로 glow 만큼 자체 발광 (반사선·테 선이 그늘에서도 유지) */
const texMat = (id: TexId, glow = 0) => {
  const key = `t${id}:${glow}`;
  let m = matCache.get(key);
  if (!m) {
    const map = protagonistTexture(id);
    m = lambert(0xffffff, { map, emissiveMap: map, emissive: scaleHex(0xffffff, glow) });
    matCache.set(key, m);
  }
  return m;
};

function buildMesh(p: PartSpec, side: 1 | -1): THREE.Mesh {
  const glow = p.glow ?? 0;
  let material: THREE.Material | THREE.Material[] = plainMat(p.color, glow);
  if (p.tex) {
    material = Array.from({ length: 6 }, () => plainMat(p.color, glow));
    for (const [face, id] of Object.entries(p.tex) as [TexFace, TexId][]) material[FACE_SLOT[face]] = texMat(id, glow);
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), material);
  m.name = p.name;
  m.position.set(p.pos[0] * side, p.pos[1], p.pos[2]);
  if (p.rot) m.rotation.set(p.rot[0], p.rot[1] * side, p.rot[2] * side);
  return m;
}

/** 데이터 파츠를 그룹에 붙인다 (mirror 파츠는 좌우 한 쌍) */
function addParts(group: THREE.Object3D, parts: readonly PartSpec[]) {
  for (const p of parts) {
    group.add(buildMesh(p, 1));
    if (p.mirror) group.add(buildMesh(p, -1));
  }
}

const joint = (parent: THREE.Object3D, x: number, y: number) => {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  parent.add(g);
  return g;
};

/**
 * 주인공 캐릭터: 30대 중반 동아시아 남성 전직 과학자 (GAME_DESIGN 14-1). 원점=발, 정면=-z.
 * 컴팩트·근력 체형(어깨·허벅지 굵게), 약간 큰 머리, 검은 단정한 머리 + 가는 테 안경, 크림 셔츠(소매 걷음) + 회색 슬랙스 + 벨트,
 * 구부정한 탐험가 자세. 외부 에셋 없음: 박스 + 절차 텍스처 + PS1 재질. 파츠 사양은 data/protagonist.ts.
 * 오른손에 휴대 장치(heldDevice)를 든다 — 장치는 부착부(mount)로 분리돼 있어 교체 가능.
 */
export function protagonistCharacter(): CharacterModel {
  const J = JOINTS;
  const root = new THREE.Group();
  const body = new THREE.Group(); // 걷기 상하 흔들림
  root.add(body);

  // --- 몸통(구부정 숙임 피벗=엉덩이) / 가슴(숨쉬기) / 머리 ---
  const torso = joint(body, 0, J.hipY);
  addParts(torso, TORSO_PARTS);
  const chest = joint(torso, 0, CHEST.pivotY);
  addParts(chest, CHEST.parts);
  const head = joint(torso, 0, J.neckY);
  addParts(head, HEAD_PARTS);

  // --- 다리 ---
  const mkLeg = (side: 1 | -1) => {
    const thigh = joint(body, side * J.hipX, J.hipY);
    addParts(thigh, THIGH_PARTS);
    const knee = joint(thigh, 0, J.kneeY);
    addParts(knee, SHIN_PARTS);
    return { thigh, knee };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // --- 팔 ---
  const mkArm = (side: 1 | -1) => {
    const shoulder = joint(torso, side * J.shoulderX, J.shoulderY);
    addParts(shoulder, UPPER_ARM_PARTS);
    const elbow = joint(shoulder, 0, J.elbowY);
    addParts(elbow, FOREARM_PARTS);
    const mount = joint(elbow, 0, J.wristY); // 손 위치 = 손에 든 물건의 부착부
    return { shoulder, elbow, mount };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // --- 휴대 장치: 오른손 부착부에 연결 (분리됨) ---
  const device = createHeldDevice();
  armR.mount.add(device.group);

  // --- 절차 애니메이션 ---
  let phase = 0, idleT = 0, kick = 0;
  const pose = { ...REST_POSE };
  const apply = () => {
    legL.thigh.rotation.x = pose.thighL; legL.knee.rotation.x = -pose.kneeL;
    legR.thigh.rotation.x = pose.thighR; legR.knee.rotation.x = -pose.kneeR;
    armL.shoulder.rotation.set(pose.armL, 0, pose.armLz); armL.elbow.rotation.x = pose.elbowL;
    armR.shoulder.rotation.x = pose.armR + kick * V.kickArm; armR.elbow.rotation.x = pose.elbowR;
    device.group.position.z = kick * V.kickBack;
    torso.rotation.x = -(pose.lean - kick * V.kickTorso); // 앞(-z)으로 숙임, 반동엔 젖혀짐
    head.rotation.x = pose.headPitch;
    chest.scale.y = pose.chest;
    chest.scale.x = chest.scale.z = 1 + (pose.chest - 1) * 0.6;
    body.position.y = pose.bob;
  };
  // 첫 프레임부터 정지 자세
  Object.assign(pose, targetPose({ speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 }, 0, 0));
  apply();

  return {
    root, muzzle: device.muzzle, hand: device.hand,
    kick(strength: number) { kick = Math.min(kick + strength, 1.5); },
    setGlow(v: number) { device.setGlow(v); },
    update(dt: number, st: CharacterState) {
      phase = advancePhase(phase, st.speed, st.grounded, dt);
      idleT += dt;
      blendPose(pose, targetPose(st, phase, idleT), followFactor(V.poseSmooth, dt));
      kick *= Math.exp(-V.kickDecay * dt);
      apply();
    },
  };
}
