/**
 * 보관 장비: 조끼(전술 탄입대)·가방(배낭). 장착하면 이 크기의 격자를 제공한다 (사망하면 내용물과 함께 손실).
 * 비어 있어야 벗을 수 있다. 주머니(작은 고정 격자)는 장비 없이도 항상 있다 (TUNING.hub.grid.pockets).
 */
export type ContainerSlot = 'vest' | 'backpack';
export interface ContainerDef { id: string; slot: ContainerSlot; w: number; h: number }
export const CONTAINER_SLOTS: ContainerSlot[] = ['vest', 'backpack'];
export const CONTAINERS: Record<string, ContainerDef> = {
  scrap_rig:       { id: 'scrap_rig',       slot: 'vest',     w: 4, h: 2 },
  tactical_rig:    { id: 'tactical_rig',    slot: 'vest',     w: 6, h: 2 },
  canvas_backpack: { id: 'canvas_backpack', slot: 'backpack', w: 6, h: 4 },
  field_pack:      { id: 'field_pack',      slot: 'backpack', w: 8, h: 6 },
};
