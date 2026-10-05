import * as THREE from 'three';
import { ITEMS } from '../data/items';
import { lambert } from '../render/palette';

interface LootItem {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  materials: Record<string, number>;
}

const PICKUP_RADIUS = 1.6;
const geo = new THREE.OctahedronGeometry(0.3, 0);

/** 전리품(아이템 id → 수량: 재료·샘플·장비 부품). 가까이 가면 자동 습득 — 터치에서도 별도 조작이 필요 없다.
 *  가방에 자리가 없으면(canPick=false) 그 자리에 남는다 */
export class Loot {
  private items: LootItem[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {}

  /** 가장 많은 아이템의 색으로 표시하고(샘플이 있으면 샘플 색), 발광을 줘서 어두운 곳에서도 보이게 한다 */
  spawn(pos: [number, number, number], materials: Record<string, number>) {
    const sample = Object.keys(materials).find((id) => ITEMS[id]?.kind === 'sample');
    const main = sample ?? Object.entries(materials).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'scrap';
    const color = ITEMS[main]?.color ?? 0xffffff;
    const mesh = new THREE.Mesh(geo, lambert(color, { emissive: color }));
    const total = Object.values(materials).reduce((a, b) => a + b, 0);
    mesh.scale.setScalar(0.8 + Math.min(total, 10) * 0.07);
    mesh.position.set(pos[0], pos[1] + 0.7, pos[2]);
    this.scene.add(mesh);
    this.items.push({ mesh, baseY: pos[1] + 0.7, phase: Math.random() * 6.28, materials });
  }

  get count() { return this.items.length; }

  /** 습득한 목록을 반환. canPick 이 거짓이면 줍지 않는다(가방 가득). blocked 는 이번 프레임에 닿았지만 못 주운 것이 있는지 */
  update(dt: number, playerPos: THREE.Vector3, canPick: (items: Record<string, number>) => boolean = () => true): { picked: Record<string, number>[]; blocked: boolean } {
    this.t += dt;
    const picked: Record<string, number>[] = [];
    let blocked = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.position.y = it.baseY + Math.sin(this.t * 2 + it.phase) * 0.12;
      it.mesh.rotation.y += dt * 1.5;
      const dx = it.mesh.position.x - playerPos.x, dz = it.mesh.position.z - playerPos.z;
      const dy = it.mesh.position.y - (playerPos.y + 0.9);
      if (dx * dx + dz * dz + dy * dy < PICKUP_RADIUS * PICKUP_RADIUS) {
        if (!canPick(it.materials)) { blocked = true; continue; }
        picked.push(it.materials);
        this.scene.remove(it.mesh);
        (it.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
      }
    }
    return { picked, blocked };
  }
}
