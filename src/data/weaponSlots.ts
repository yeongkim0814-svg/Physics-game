/** 무기 칸: 주무기 2 · 보조무기(소형) 1 · 근접무기 1. 베이스마다 어느 분류인지(BaseDef.slotClass)로 들어갈 칸이 정해진다 */
export type SlotClass = 'primary' | 'secondary' | 'melee';
export type WeaponSlot = 'primary1' | 'primary2' | 'secondary' | 'melee';
export const WEAPON_SLOTS: { id: WeaponSlot; cls: SlotClass; label: string }[] = [
  { id: 'primary1', cls: 'primary', label: '주 무기' },
  { id: 'primary2', cls: 'primary', label: '주 무기(등)' },
  { id: 'secondary', cls: 'secondary', label: '보조 무기' },
  { id: 'melee', cls: 'melee', label: '근접 무기' },
];
export const CLASS_LABEL: Record<SlotClass, string> = { primary: '주무기', secondary: '보조무기', melee: '근접무기' };
