import * as THREE from 'three';
import { createMaterial } from '../render/materials';
import { LP } from '../render/style';
import { VISUAL } from '../config/settings';
import { SJ } from '../data/scientist';
import { followFactor } from './cameraMath';
import type { CharacterModel, CharacterState } from './CharacterModel';
import { createHeldDevice } from './heldDevice';
import { advancePhase, blendPose, footDrop, REST_POSE, targetPose, type PoseConfig } from './protagonistPose';
import { buildScientistGeometry } from './scientistMesh';
import { fabricTexture } from './protagonistTextures';
import { sashAngles, skirtAngles } from './voxelPose';

const V = VISUAL.character;
const S = VISUAL.scientist;
const R = LP.character;
/** 공통 자세 설정 + 로브 과학자 덮어쓰기 */
const C: PoseConfig = { ...V, ...S.pose };

const joint = (parent: THREE.Object3D, x: number, y: number) => {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  parent.add(g);
  return g;
};

/**
 * 주인공 캐릭터 (후드 로브 과학자): 후드·로브로 얼굴·머리·옷이 보이지 않는 익명 연구자. 원점=발, 정면=-z.
 * 스무스 곡면 로프트(smoothMesh) + 정점색(AO·주름 명암) + 천 텍스처, 재질 1종(createMaterial smooth). 사양 data/scientist.ts.
 * 관절 그룹(몸통·후드·좌우 다리/팔)과 로브 아랫자락(앞/뒤)을 노드 트리에 매단다. 자세는 protagonistPose(걷기·공중·조준·반동·숨쉬기)를 재사용하고
 * 아랫자락이 다리 스윙을 따라 들리고 천이 살랑인다. 오른손 부착부에 휴대 장치(heldDevice).
 */
export function scientistCharacter(): CharacterModel {
  const geo = buildScientistGeometry(R.exposure);
  const mat = createMaterial(0xffffff, { map: fabricTexture(), vertexColors: true, smooth: true, selfGlow: R.selfGlow, rim: R.rim });
  const addGeo = (group: THREE.Object3D, g: THREE.BufferGeometry | undefined, name: string) => {
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    group.add(m);
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // 걷기 상하 흔들림 + 발 접지 보정
  root.add(body);

  const torso = joint(body, 0, SJ.hipY);
  addGeo(torso, geo.torso, 'torso');
  const head = joint(torso, 0, SJ.neckY);
  addGeo(head, geo.head, 'hood');
  const skirtF = joint(body, 0, SJ.skirtPivotY), skirtB = joint(body, 0, SJ.skirtPivotY);
  addGeo(skirtF, geo.skirtF, 'skirtF');
  addGeo(skirtB, geo.skirtB, 'skirtB');

  const mkLeg = (side: 1 | -1) => {
    const g = side === 1 ? 'R' : 'L';
    const thigh = joint(body, side * SJ.hipX, SJ.hipY);
    addGeo(thigh, geo.thigh[g], `thigh${g}`);
    const knee = joint(thigh, 0, SJ.kneeY);
    addGeo(knee, geo.shin[g], `shin${g}`);
    return { thigh, knee };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const mkArm = (side: 1 | -1) => {
    const g = side === 1 ? 'R' : 'L';
    const shoulder = joint(torso, side * SJ.shoulderX, SJ.shoulderY);
    addGeo(shoulder, geo.upperArm[g], `sleeveUpper${g}`);
    const elbow = joint(shoulder, 0, SJ.elbowY);
    addGeo(elbow, geo.forearm[g], `sleeveFore${g}`);
    const mount = joint(elbow, 0, SJ.wristY); // 손(주먹) = 손에 든 물건의 부착부
    return { shoulder, elbow, mount };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const device = createHeldDevice();
  armR.mount.add(device.group);

  let phase = 0, idleT = 0, kick = 0, lastSpeed = 0;
  const pose = { ...REST_POSE };
  const apply = () => {
    legL.thigh.rotation.x = pose.thighL; legL.knee.rotation.x = -pose.kneeL;
    legR.thigh.rotation.x = pose.thighR; legR.knee.rotation.x = -pose.kneeR;
    armL.shoulder.rotation.set(pose.armL, 0, pose.armLz); armL.elbow.rotation.x = pose.elbowL;
    armR.shoulder.rotation.set(pose.armR + kick * V.kickArm, 0, pose.armRz); armR.elbow.rotation.x = pose.elbowR;
    device.group.position.z = kick * V.kickBack;
    torso.rotation.x = -(pose.lean - kick * V.kickTorso);
    head.rotation.x = pose.headPitch;
    torso.scale.x = torso.scale.z = 1 + (pose.chest - 1) * 0.6;
    // 아랫자락: 앞자락은 앞으로 나간 다리, 뒷자락은 뒤로 간 다리를 따라 들리고, 이동하면 천이 뒤로 날리며 살랑인다
    const sk = skirtAngles(pose, S.skirtFollow);
    const f = sashAngles(idleT, lastSpeed, false, S.sway), b = sashAngles(idleT, lastSpeed, true, S.sway);
    skirtF.rotation.set(sk.front + f.x, 0, f.z);
    skirtB.rotation.set(sk.back + b.x, 0, b.z);
    body.position.y = footDrop(pose, SJ.thighLen, SJ.shinLen) + pose.bob;
  };
  Object.assign(pose, targetPose({ speed: 0, grounded: true, aiming: false, vy: 0, aimPitch: 0 }, 0, 0, C));
  apply();

  return {
    root, muzzle: device.muzzle, hand: device.hand,
    kick(strength: number) { kick = Math.min(kick + strength, 1.5); },
    setGlow(v: number) { device.setGlow(v); },
    update(dt: number, st: CharacterState) {
      phase = advancePhase(phase, st.speed, st.grounded, dt, C);
      idleT += dt;
      lastSpeed = st.speed;
      blendPose(pose, targetPose(st, phase, idleT, C), followFactor(C.poseSmooth, dt));
      kick *= Math.exp(-V.kickDecay * dt);
      apply();
    },
  };
}
