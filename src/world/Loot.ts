import * as THREE from 'three';
import { MATERIALS } from '../data/materials';
import { lambert } from '../render/palette';

interface LootItem {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  materials: Record<string, number>;
}

const PICKUP_RADIUS = 1.6;
const geo = new THREE.OctahedronGeometry(0.3, 0);

/** 전리품(재료 덩어리). 가까이 가면 자동 습득 — 터치에서도 별도 조작이 필요 없다 */
export class Loot {
  private items: LootItem[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {}

  /** 가장 많은 재료의 색으로 표시하고, 발광을 줘서 어두운 곳에서도 보이게 한다 */
  spawn(pos: [number, number, number], materials: Record<string, number>) {
    const main = Object.entries(materials).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'scrap';
    const color = MATERIALS[main]?.color ?? 0xffffff;
    const mesh = new THREE.Mesh(geo, lambert(color, { emissive: color }));
    const total = Object.values(materials).reduce((a, b) => a + b, 0);
    mesh.scale.setScalar(0.8 + Math.min(total, 10) * 0.07);
    mesh.position.set(pos[0], pos[1] + 0.7, pos[2]);
    this.scene.add(mesh);
    this.items.push({ mesh, baseY: pos[1] + 0.7, phase: Math.random() * 6.28, materials });
  }

  get count() { return this.items.length; }

  /** 습득한 재료 목록을 반환 (호출측이 인벤토리에 합산) */
  update(dt: number, playerPos: THREE.Vector3): Record<string, number>[] {
    this.t += dt;
    const picked: Record<string, number>[] = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.position.y = it.baseY + Math.sin(this.t * 2 + it.phase) * 0.12;
      it.mesh.rotation.y += dt * 1.5;
      const dx = it.mesh.position.x - playerPos.x, dz = it.mesh.position.z - playerPos.z;
      const dy = it.mesh.position.y - (playerPos.y + 0.9);
      if (dx * dx + dz * dz + dy * dy < PICKUP_RADIUS * PICKUP_RADIUS) {
        picked.push(it.materials);
        this.scene.remove(it.mesh);
        (it.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
      }
    }
    return picked;
  }
}
