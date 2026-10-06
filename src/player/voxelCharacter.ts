import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { createMaterial } from '../render/materials';
import { isPS1, LP } from '../render/style';
import { followFactor } from './cameraMath';
import type { CharacterModel, CharacterState } from './CharacterModel';
import { advancePhase, blendPose, footDrop, REST_POSE, targetPose } from './protagonistPose';
import { decodeAndBuild, type BuiltNode } from './voxelBuild';
import type { MeshData } from './voxelMesher';
import { VOXEL_FILE } from './voxelData';
import { armTilt, approach, sashAngles, skirtAngles, VOXEL_POSE_CONFIG } from './voxelPose';
import { nodeLocalPosition } from './voxelParts';

const V = VISUAL.voxelCharacter;
const C = VOXEL_POSE_CONFIG;
const R = LP.character;

function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * 주인공 캐릭터 (M1j): 사용자 도면(정면·측면·후면)을 scripts/carve_character.py 로 카빙한 복셀 모델.
 * 부위별 그룹(머리·몸통·골반·좌우 위팔/아래팔·허벅지/정강이/발·실험복 앞/뒤 자락·어깨 천 자락 2·장치)을 그리디 메싱한 메시를
 * 관절 피벗(data 의 pivots) 노드 트리에 매단다. 정점색 + 복셀 AO, 플랫 셰이딩, 재질은 createMaterial 팩토리 경유.
 * 자세는 protagonistPose(걷기·공중·조준·반동·숨쉬기)를 재사용하고 자락(다리 추종)·천(사인파)을 더한다.
 */
export function voxelCharacter(): CharacterModel {
  const exposure = isPS1 ? V.ps1Exposure : R.exposure * V.exposureScale;
  const { nodes } = decodeAndBuild(VOXEL_FILE, { aoCurve: V.aoCurve, colorScale: exposure, aoPerFace: V.aoPerFace });
  const P = VOXEL_FILE.pivots;

  const common = isPS1
    ? { emissive: VISUAL.character.look.ps1Emissive, alwaysVertexColors: true }
    : { selfGlow: R.selfGlow, rim: R.rim, alwaysVertexColors: true };
  const bodyMat = createMaterial(0xffffff, { vertexColors: true, ...common });
  // 화면: 정점색(청록) × 재질 + emissive. 안개 무시 (heldDevice 와 같은 규약)
  const cyan = new THREE.Color(V.screenColor);
  const glowMat = createMaterial(0xffffff, { vertexColors: true, alwaysVertexColors: true, emissive: 0x000000, fog: false });
  const setEmissive = (k: number) => glowMat.emissive.copy(cyan).multiplyScalar(k);
  setEmissive(V.idleGlow);

  const root = new THREE.Group();
  const body = new THREE.Group(); // 걷기 상하 흔들림 + 발 접지 보정
  root.add(body);

  const groups = new Map<string, THREE.Group>();
  const add = (n: BuiltNode) => {
    const g = new THREE.Group();
    g.name = n.spec.name;
    const lp = nodeLocalPosition(VOXEL_FILE, n.spec);
    g.position.set(lp[0], lp[1], lp[2]);
    (n.spec.parent ? groups.get(n.spec.parent)! : body).add(g);
    groups.set(n.spec.name, g);
    if (n.mesh) { const m = new THREE.Mesh(toGeometry(n.mesh), bodyMat); m.name = `${n.spec.name}:body`; g.add(m); }
    if (n.emissive) { const m = new THREE.Mesh(toGeometry(n.emissive), glowMat); m.name = `${n.spec.name}:screen`; g.add(m); }
    return g;
  };
  for (const n of nodes) add(n);
  const G = (name: string) => groups.get(name)!;

  // 장치 노드(아래팔 로컬 = 팔꿈치 피벗 기준)에 총구/손 기준점
  const device = G('device');
  const devBase = device.position.clone();
  const elbowR = P.elbowR;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(P.deviceMuzzle[0] - elbowR[0], P.deviceMuzzle[1] - elbowR[1], P.deviceMuzzle[2] - elbowR[2]);
  const hand = new THREE.Object3D();
  hand.position.set(P.deviceHand[0] - elbowR[0], P.deviceHand[1] - elbowR[1], P.deviceHand[2] - elbowR[2]);
  device.add(muzzle, hand);

  const hipY = (P.hipR[1] + P.hipL[1]) / 2, kneeY = (P.kneeR[1] + P.kneeL[1]) / 2;
  const thighLen = hipY - kneeY, shinLen = kneeY;
  // 도면에서 오른팔이 바깥으로 기울어진 각: 조준 시 상쇄 (어깨 → 장치 손)
  const tiltR = armTilt(P.shoulderR, P.deviceHand);

  const thigh = { L: G('thighL'), R: G('thighR') };
  const shin = { L: G('shinL'), R: G('shinR') };
  const foot = { L: G('footL'), R: G('footR') };
  const arm = { L: G('armUpperL'), R: G('armUpperR') };
  const fore = { L: G('armForeL'), R: G('armForeR') };
  const waist = G('waist'), head = G('head'), torso = G('torso');
  const skirtF = G('skirtF'), skirtB = G('skirtB'), sashF = G('sashF'), sashB = G('sashB');

  let phase = 0, idleT = 0, kick = 0, aimK = 0;
  const pose = { ...REST_POSE };
  let lastSpeed = 0;
  const apply = () => {
    for (const s of ['L', 'R'] as const) {
      const th = s === 'L' ? pose.thighL : pose.thighR, kn = s === 'L' ? pose.kneeL : pose.kneeR;
      thigh[s].rotation.x = th;
      shin[s].rotation.x = -kn;
      foot[s].rotation.x = -(th - kn) * V.footLevel;
    }
    arm.L.rotation.set(pose.armL, 0, pose.armLz);
    fore.L.rotation.x = pose.elbowL;
    arm.R.rotation.set(pose.armR + kick * C.kickArm, 0, pose.armRz - aimK * V.aimTiltCancel * tiltR);
    fore.R.rotation.x = pose.elbowR;
    device.position.set(devBase.x, devBase.y + kick * C.kickBack, devBase.z); // 반동: 장치가 아래팔 축(팔꿈치 쪽)으로 물러난다
    waist.rotation.x = -(pose.lean - kick * C.kickTorso);
    head.rotation.x = pose.headPitch;
    torso.scale.set(1 + (pose.chest - 1) * 0.6, pose.chest, 1 + (pose.chest - 1) * 0.6);
    const sk = skirtAngles(pose);
    skirtF.rotation.x = sk.front;
    skirtB.rotation.x = sk.back;
    // 발 접지: 다리가 굽거나 스윙해 짧아진 만큼 몸 전체를 내린다 (bob 은 그 위에)
    body.position.y = footDrop(pose, thighLen, shinLen) + pose.bob;
  };
  const sway = () => {
    const f = sashAngles(idleT, lastSpeed, false), b = sashAngles(idleT, lastSpeed, true);
    sashF.rotation.set(f.x, 0, f.z);
    sashB.rotation.set(b.x, 0, b.z);
  };
  Object.assign(pose, targetPose({ speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 }, 0, 0, C));
  apply();
  sway();

  return {
    root, muzzle, hand,
    kick(strength: number) { kick = Math.min(kick + strength, 1.5); },
    setGlow(v: number) { setEmissive(V.idleGlow + Math.max(0, Math.min(1.2, v))); },
    update(dt: number, st: CharacterState) {
      phase = advancePhase(phase, st.speed, st.grounded, dt, C);
      idleT += dt;
      lastSpeed = st.speed;
      blendPose(pose, targetPose(st, phase, idleT, C), followFactor(C.poseSmooth, dt));
      aimK = approach(aimK, st.aiming ? 1 : 0, V.aimBlendRate, dt);
      kick *= Math.exp(-C.kickDecay * dt);
      apply();
      sway();
    },
  };
}
