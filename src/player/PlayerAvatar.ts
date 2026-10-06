import * as THREE from 'three';
import type { AimSolution, AimSource, ThrowSource, WeaponFeedback } from '../core/types';
import { TUNING } from '../config/tuning';
import { muzzleDirection } from '../weapons/aim';
import type { CharacterModel } from './CharacterModel';
import type { PlayerController } from './PlayerController';
import type { ThirdPersonCamera } from './ThirdPersonCamera';

/**
 * 플레이어 몸(PlayerController) ↔ 캐릭터 모델(CharacterModel) ↔ 카메라를 잇는다.
 * - 모델 root 를 발 위치/몸 방향에 맞추고 절차 애니메이션을 돌린다
 * - 무기/던지기에 "캐릭터 총구(손) → 화면 중앙 조준점" 발사 정보를 준다 (AimSource, ThrowSource)
 * - 무기의 반동 킥/충전 발광을 모델에 전달한다 (WeaponFeedback)
 * 호출 순서: player.update → avatar.update → (카메라는 avatar.update 가 갱신) → 무기 update
 */
export class PlayerAvatar implements AimSource, ThrowSource, WeaponFeedback {
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private player: PlayerController,
    private cam: ThirdPersonCamera,
    readonly model: CharacterModel,
  ) {
    scene.add(model.root);
  }

  get velocity() { return this.player.velocity; }

  /** 부활/순간이동 후 카메라와 모델을 즉시 맞춘다 */
  snap() {
    this.cam.snap();
    this.syncModel(0);
  }

  update(dt: number) {
    this.syncModel(dt);
    this.cam.update(dt);
  }

  muzzleAim(): AimSolution { return this.solve(this.model.muzzle); }
  handAim(): AimSolution { return this.solve(this.model.hand); }

  kick(strength: number) { this.model.kick?.(strength); }
  setGlow(v: number) { this.model.setGlow?.(v); }

  private syncModel(dt: number) {
    const p = this.player;
    this.model.root.position.copy(p.position);
    this.model.root.rotation.y = p.facing;
    this.model.update(dt, {
      speed: Math.hypot(p.velocity.x, p.velocity.z),
      grounded: p.grounded,
      aiming: p.aiming,
      vy: p.velocity.y,
      aimPitch: p.pitch,
    });
    this.model.root.updateMatrixWorld(true);
  }

  private solve(from: THREE.Object3D): AimSolution {
    const origin = from.getWorldPosition(new THREE.Vector3());
    const target = this.cam.aimTarget(origin);
    const dir = muzzleDirection(origin, target, this.cam.forward(this.tmp), TUNING.camera.maxAimDeviation);
    return { origin, dir, target };
  }
}
