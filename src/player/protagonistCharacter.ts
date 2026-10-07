import * as THREE from 'three';
import { createMaterial } from '../render/materials';
import { LP } from '../render/style';
import { VISUAL } from '../config/settings';
import { JOINTS } from '../data/protagonist';
import { followFactor } from './cameraMath';
import type { CharacterModel, CharacterState } from './CharacterModel';
import { createHeldDevice } from './heldDevice';
import { buildProtagonistGeometry, type GroupGeo } from './protagonistMesh';
import { advancePhase, blendPose, footDrop, REST_POSE, targetPose } from './protagonistPose';
import { fabricTexture, faceTexture } from './protagonistTextures';

const V = VISUAL.character;
const R = LP.character;

/** 렌더 재질 3종: 천(텍스처×정점색) / 단색 정점색 / 얼굴 텍스처. 셰이더 보정(selfGlow·rim) */
function makeMaterials() {
  const common = { selfGlow: R.selfGlow, rim: R.rim };
  const exposureGray = new THREE.Color().setScalar(R.exposure).getHex();
  return {
    cloth: createMaterial(0xffffff, { map: fabricTexture(), vertexColors: true, ...common }),
    plain: createMaterial(0xffffff, { vertexColors: true, ...common }),
    // 얼굴: 정점색 없이 텍스처 그대로 (exposure 만 회색으로 곱한다)
    face: createMaterial(exposureGray, { map: faceTexture(), ...common }),
  };
}

const joint = (parent: THREE.Object3D, x: number, y: number) => {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  parent.add(g);
  return g;
};

/**
 * 주인공 캐릭터 (GAME_DESIGN 14-2, M1h): 30대 중반 동아시아 남성 전직 과학자. 원점=발, 정면=-z.
 * 사용자 제공 일러스트 기준의 날씬한 실사 비율(≈7.4등신): 로우폴리 로프트 메시(약 2천 삼각형) + 정점색 AO + 천 텍스처 + 얼굴 텍스처.
 * 관절 그룹(몸통·가슴·머리·허벅지·정강이·위팔·아래팔)마다 채널별로 병합해 드로우콜을 줄이고, 애니메이션 피벗은 유지한다.
 * 오른손에 휴대 장치(heldDevice)를 든다 — 장치는 부착부(mount)로 분리돼 있어 교체 가능. 파츠 사양은 data/protagonist.ts.
 */
export function protagonistCharacter(): CharacterModel {
  const J = JOINTS;
  const mats = makeMaterials();
  const geo = buildProtagonistGeometry(R.exposure);

  const addGeo = (group: THREE.Object3D, g: GroupGeo) => {
    for (const k of ['cloth', 'plain', 'face'] as const) {
      const bg = g[k];
      if (!bg) continue;
      const m = new THREE.Mesh(bg, mats[k]);
      m.name = k;
      group.add(m);
    }
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // 걷기 상하 흔들림 + 발 접지 보정
  root.add(body);

  // --- 몸통(숙임 피벗=엉덩이) / 가슴(숨쉬기) / 머리 ---
  const torso = joint(body, 0, J.hipY);
  addGeo(torso, geo.torso);
  const chest = joint(torso, 0, J.chestPivotY);
  addGeo(chest, geo.chest); // 가슴 지오메트리는 가슴 피벗 로컬 좌표
  const head = joint(torso, 0, J.neckY);
  addGeo(head, geo.head);

  // --- 다리 ---
  const mkLeg = (side: 1 | -1) => {
    const g = side === 1 ? 'R' : 'L';
    const thigh = joint(body, side * J.hipX, J.hipY);
    addGeo(thigh, geo.thigh[g]);
    const knee = joint(thigh, 0, J.kneeY);
    addGeo(knee, geo.shin[g]);
    return { thigh, knee };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // --- 팔 ---
  const mkArm = (side: 1 | -1) => {
    const g = side === 1 ? 'R' : 'L';
    const shoulder = joint(torso, side * J.shoulderX, J.shoulderY);
    addGeo(shoulder, geo.upperArm[g]);
    const elbow = joint(shoulder, 0, J.elbowY);
    addGeo(elbow, geo.forearm[g]);
    const mount = joint(elbow, 0, J.wristY); // 손(주먹) 위치 = 손에 든 물건의 부착부
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
    armR.shoulder.rotation.set(pose.armR + kick * V.kickArm, 0, pose.armRz); armR.elbow.rotation.x = pose.elbowR;
    device.group.position.z = kick * V.kickBack;
    torso.rotation.x = -(pose.lean - kick * V.kickTorso); // 앞(-z)으로 숙임, 반동엔 젖혀짐
    head.rotation.x = pose.headPitch;
    chest.scale.y = pose.chest;
    chest.scale.x = chest.scale.z = 1 + (pose.chest - 1) * 0.6;
    // 발 접지: 다리가 굽거나 스윙해 짧아진 만큼 내려, 가장 낮은 발이 땅에 닿게 (걸을 때 bob 은 그 위에 더한다)
    body.position.y = footDrop(pose, J.thighLen, J.shinLen) + pose.bob;
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
