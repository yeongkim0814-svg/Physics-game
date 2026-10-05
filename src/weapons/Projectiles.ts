import * as THREE from 'three';
import { RAPIER } from '../core/physics';
import type { Damageable } from '../core/types';
import { TUNING } from '../config/tuning';
import { COL } from '../render/palette';
import { lambert } from '../render/palette';
import { projectileEnergy, segmentSphereToi } from './launcherMath';

const L = TUNING.launcher;

interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  mass: number;
  life: number;
}
interface Flash { mesh: THREE.Mesh; life: number }

const FLASH_LIFE = 0.22;

/** 투사체(중력으로 휨) + 충돌(Rapier raycast / Damageable 구) + 착탄 섬광 */
export class Projectiles {
  private list: Projectile[] = [];
  private flashes: Flash[] = [];
  private geo = new THREE.IcosahedronGeometry(0.5, 0);
  private flashMat = lambert(COL.amber, { emissive: COL.amber, fog: false });
  /** 디버그/튜닝용: 마지막 착탄 위치 */
  lastImpact: THREE.Vector3 | null = null;
  hits = 0;

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    private excludeBody: RAPIER.RigidBody,
    private targets: () => Damageable[] = () => [],
  ) {}

  spawn(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, mass: number, color: number) {
    const mesh = new THREE.Mesh(this.geo, lambert(color, { emissive: COL.oliveDark }));
    mesh.scale.setScalar(0.07 * Math.cbrt(mass)); // 질량이 크면 굵게
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.list.push({ mesh, vel: dir.clone().multiplyScalar(speed), mass, life: L.projectileLife });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.vel.y -= L.projectileGravity * dt;
      const step = p.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len || 1);
      const pos = p.mesh.position;

      let toi = Infinity;
      let target: Damageable | null = null;
      const ray = new RAPIER.Ray({ x: pos.x, y: pos.y, z: pos.z }, { x: dir.x, y: dir.y, z: dir.z });
      const hit = this.world.castRay(ray, len, true, undefined, undefined, undefined, this.excludeBody);
      if (hit) toi = hit.timeOfImpact;
      for (const t of this.targets()) {
        if (!t.radius) continue;
        const h = segmentSphereToi([pos.x, pos.y, pos.z], [dir.x, dir.y, dir.z], len,
          [t.position.x, t.position.y, t.position.z], t.radius);
        if (h !== null && h < toi) { toi = h; target = t; }
      }

      if (toi !== Infinity) {
        const at = pos.clone().addScaledVector(dir, toi);
        const speed = p.vel.length();
        target?.takeDamage(projectileEnergy(p.mass, speed) * L.damagePerJoule, 'physical');
        this.impact(at);
        this.remove(i);
        continue;
      }
      pos.add(step);
      p.life -= dt;
      if (p.life <= 0 || pos.y < -30) this.remove(i);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.mesh.scale.setScalar(Math.max(0.001, 0.5 * (f.life / FLASH_LIFE)));
      if (f.life <= 0) { this.scene.remove(f.mesh); this.flashes.splice(i, 1); }
    }
  }

  private impact(at: THREE.Vector3) {
    this.hits++;
    this.lastImpact = at.clone();
    const mesh = new THREE.Mesh(this.geo, this.flashMat);
    mesh.position.copy(at);
    mesh.scale.setScalar(0.5);
    this.scene.add(mesh);
    this.flashes.push({ mesh, life: FLASH_LIFE });
  }

  private remove(i: number) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
    this.list.splice(i, 1);
  }
}
