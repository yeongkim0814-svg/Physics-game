import * as THREE from 'three';
import { COL, lambert } from '../render/palette';
import { VISUAL } from '../config/settings';
import { TUNING } from '../config/tuning';
import { followFactor } from './cameraMath';
import type { CharacterModel, CharacterState } from './CharacterModel';

const V = VISUAL.character;

/**
 * 임시 캐릭터 (외부 에셋 없음): 박스로 만든 후드+망토 인체형. 원점=발, 정면=-z.
 * 크림 목도리 · 구리 후드/벨트 · 청회색 옷 · 가슴의 호박색 발광 포인트 하나. 오른손에 사출기를 들고 있다.
 * 걷기(팔다리 스윙)/공중(다리 벌림·상체 기울임)/조준(무기 든 팔 들기)/반동 킥을 절차 애니메이션으로 낸다.
 */
export function placeholderCharacter(): CharacterModel {
  const root = new THREE.Group();
  const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, emissive = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color, { emissive }));
    m.position.set(x, y, z);
    return m;
  };

  // --- 몸통 (엉덩이 피벗 높이 0.86 에서 위로) ---
  const hipY = 0.86;
  const body = new THREE.Group(); // 걷기 상하 흔들림
  root.add(body);
  const torso = new THREE.Group(); // 낙하 시 기울임
  torso.position.y = hipY;
  body.add(torso);
  torso.add(
    box(0.5, 0.56, 0.3, COL.stone, 0, 0.3, 0),
    box(0.54, 0.08, 0.34, COL.copper, 0, 0.04, 0),                    // 벨트
    box(0.58, 0.12, 0.38, COL.cream, 0, 0.58, 0),                     // 목도리
    box(0.56, 0.72, 0.1, COL.copperDark, 0, 0.22, 0.2),               // 망토
    box(0.1, 0.1, 0.06, 0x000000, 0, 0.34, -0.17, COL.amber),          // 발광 포인트(에너지 = amber)
  );
  const head = new THREE.Group();
  head.position.y = 0.58 + 0.28;
  torso.add(head);
  head.add(
    box(0.4, 0.4, 0.4, COL.copper, 0, 0, 0.02),                       // 후드
    box(0.26, 0.22, 0.04, COL.shade, 0, -0.02, -0.19),                // 얼굴 그늘
    box(0.14, 0.2, 0.2, COL.copperDark, 0, 0.1, 0.24),                // 후드 꼬리
  );

  // --- 다리 ---
  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.13, hipY, 0);
    g.add(box(0.19, 0.7, 0.21, COL.shade, 0, -0.35, 0), box(0.22, 0.16, 0.3, COL.copperDark, 0, -0.78, -0.04));
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // --- 팔 (어깨 피벗) ---
  const shoulderY = 0.5;
  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.34, shoulderY, 0);
    g.add(box(0.14, 0.52, 0.14, COL.stoneDark, 0, -0.26, 0), box(0.12, 0.12, 0.12, COL.dust, 0, -0.58, 0));
    torso.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // --- 무기 (오른손). 로컬 -y 가 총신 방향: 팔을 앞으로 들면 총신이 정면을 향한다 ---
  const weapon = new THREE.Group();
  weapon.position.y = -0.58;
  armR.add(weapon);
  const tipMat = lambert(COL.shade, { emissive: 0x000000, fog: false });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 6), lambert(COL.copper));
  barrel.position.y = -0.38;
  const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), tipMat);
  tip.position.y = -0.62;
  weapon.add(
    box(0.13, 0.42, 0.15, COL.copperDark, 0, -0.1, 0),
    barrel,
    box(0.1, 0.14, 0.12, COL.shade, 0, 0, 0.12),                      // 손잡이
    tip,
  );
  const muzzle = new THREE.Object3D();
  muzzle.position.y = -0.68;
  weapon.add(muzzle);
  const hand = new THREE.Object3D();
  hand.position.y = -0.04;
  weapon.add(hand);

  // --- 절차 애니메이션 ---
  let phase = 0;
  let kick = 0;
  // 현재 자세(보간 대상)
  const pose = { legL: 0, legR: 0, armL: 0, armLz: 0, armR: 0, lean: 0, bob: 0 };

  return {
    root, muzzle, hand,
    kick(strength: number) { kick = Math.min(kick + strength, 1.5); },
    setGlow(v: number) { tipMat.emissive.setHex(COL.amber).multiplyScalar(Math.max(0, Math.min(1.2, v))); },
    update(dt: number, st: CharacterState) {
      const amp = Math.min(st.speed / TUNING.player.moveSpeed, 1.4);
      if (st.grounded) phase += st.speed * V.strideRate * dt;
      const sw = Math.sin(phase) * amp;

      let tLegL: number, tLegR: number, tArmL: number, tArmLz = 0, tLean = 0, tBob = 0;
      if (st.grounded) {
        tLegL = sw * V.legSwing; tLegR = -sw * V.legSwing;
        tArmL = -sw * V.armSwing;
        tBob = Math.abs(Math.cos(phase)) * V.bob * amp;
      } else {
        tLegL = V.airLeg; tLegR = -V.airLeg * 0.5;
        tArmL = -0.4; tArmLz = -V.airArm;
        tLean = Math.max(0, Math.min(1, -st.vy / V.leanVy)) * V.fallLean;
      }
      // 무기 든 팔: 조준하면 수평+pitch, 아니면 앞으로 기운 채 약하게 스윙
      const tArmR = st.aiming
        ? V.aimArmBase + st.aimPitch
        : V.restArm + (st.grounded ? sw * V.armSwing * 0.3 : 0);

      const k = followFactor(V.poseSmooth, dt);
      pose.legL += (tLegL - pose.legL) * k;
      pose.legR += (tLegR - pose.legR) * k;
      pose.armL += (tArmL - pose.armL) * k;
      pose.armLz += (tArmLz - pose.armLz) * k;
      pose.armR += (tArmR - pose.armR) * k;
      pose.lean += (tLean - pose.lean) * k;
      pose.bob += (tBob - pose.bob) * k;

      kick *= Math.exp(-V.kickDecay * dt);
      legL.rotation.x = pose.legL;
      legR.rotation.x = pose.legR;
      armL.rotation.set(pose.armL, 0, pose.armLz);
      armR.rotation.x = pose.armR + kick * V.kickArm;
      weapon.position.z = kick * V.kickBack;
      torso.rotation.x = -pose.lean; // 앞(-z)으로 숙임
      body.position.y = pose.bob;
    },
  };
}
