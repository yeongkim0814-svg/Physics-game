import { MATERIAL_ORDER } from '../data/materials';

/** 소지 재료(carried). 사망 시 손실 규칙은 T8 에서 raid 상태와 함께 처리 */
export class Inventory {
  constructor(public materials: Record<string, number>, public selected = MATERIAL_ORDER[1]) {}

  count(id = this.selected) { return this.materials[id] ?? 0; }

  consume(id: string, n: number): boolean {
    if (this.count(id) < n) return false;
    this.materials[id] -= n;
    return true;
  }

  /** 다음/이전 재료로 전환 (재고가 있는 것만) */
  cycle(dir = 1) {
    const n = MATERIAL_ORDER.length;
    let i = MATERIAL_ORDER.indexOf(this.selected);
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (this.count(MATERIAL_ORDER[i]) > 0) { this.selected = MATERIAL_ORDER[i]; return; }
    }
  }
}
