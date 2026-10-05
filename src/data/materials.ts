import type { MaterialDef } from '../core/types';

/** 사출기 재료. 질량(kg)이 클수록 위력·반동↑ 하지만 희귀 */
export const MATERIALS: Record<string, MaterialDef> = {
  slag:  { id: 'slag',  name: '슬래그', mass: 1, color: 0x8c8f82 },
  scrap: { id: 'scrap', name: '고철',   mass: 2, color: 0x59603f },
  ingot: { id: 'ingot', name: '주괴',   mass: 4, color: 0xd89a2e },
};
export const MATERIAL_ORDER = ['slag', 'scrap', 'ingot'];
