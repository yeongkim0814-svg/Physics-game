import { MATERIAL_ORDER } from '../data/materials';
import { consumeFrom, countOf, type Grid } from '../inventory/grid';

/**
 * 레이드 중 탄(재료) 인벤토리. 가방 격자(bag)를 직접 들여다보는 뷰라서 사격 소모·전리품 습득이 곧바로 격자에 반영된다.
 * 소모 우선순위는 consumeFrom 참고(들고 온 것 → 레이드에서 얻은 것: 얻은 것을 더 오래 남겨 안전 보관함으로 옮길 수 있게).
 */
export class Inventory {
  constructor(private bag: Grid, public selected = MATERIAL_ORDER[1]) {}

  count(id = this.selected) { return countOf(this.bag, id); }

  consume(id: string, n: number): boolean { return consumeFrom(this.bag, id, n); }

  /** 탄으로 쓰는 재료만 {id: 수량} (HUD 표시용) */
  get materials(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of MATERIAL_ORDER) out[id] = this.count(id);
    return out;
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
