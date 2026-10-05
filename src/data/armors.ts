/** 헬멧 / 방어구(방탄복). 조끼·가방은 보관 장비(data/containers.ts) */
export type ArmorSlot = 'helmet' | 'body';
export const ARMOR_SLOTS: ArmorSlot[] = ['helmet', 'body'];
export type ResistKind = 'impact' | 'electric' | 'thermal';
export const RESIST_LABEL: Record<ResistKind, string> = { impact: '충격', electric: '전기', thermal: '열' };
export const RESIST_KINDS: ResistKind[] = ['impact', 'electric', 'thermal'];

/**
 * 방어구: 체력이 아니라 저항(0~1, 받는 피해 × (1−저항))과 이동속도 배율(1 미만 = 페널티)의 교환 관계.
 * 헬멧 1 + 방어구 1 슬롯. 내구도가 0 이면 효과(저항·페널티) 정지.
 */
export interface ArmorDef {
  id: string;
  slot: ArmorSlot;
  resist: Record<ResistKind, number>;
  speedMul: number;
  maxDurability: number;
}

export const ARMORS: Record<string, ArmorDef> = {
  scrap_vest:       { id: 'scrap_vest',       slot: 'body', resist: { impact: 0.15, electric: 0,    thermal: 0.05 }, speedMul: 0.96, maxDurability: 100 },
  plate_vest:       { id: 'plate_vest',       slot: 'body', resist: { impact: 0.35, electric: 0,    thermal: 0.10 }, speedMul: 0.85, maxDurability: 160 },
  rubber_suit:      { id: 'rubber_suit',      slot: 'body', resist: { impact: 0.05, electric: 0.45, thermal: 0.15 }, speedMul: 0.94, maxDurability: 120 },
  scrap_helmet:     { id: 'scrap_helmet',     slot: 'helmet', resist: { impact: 0.10, electric: 0,    thermal: 0.02 }, speedMul: 0.98, maxDurability: 80 },
  insulated_helmet: { id: 'insulated_helmet', slot: 'helmet', resist: { impact: 0.02, electric: 0.20, thermal: 0.05 }, speedMul: 1,    maxDurability: 80 },
};
