export type ResistKind = 'impact' | 'electric' | 'thermal';
export const RESIST_LABEL: Record<ResistKind, string> = { impact: '충격', electric: '전기', thermal: '열' };
export const RESIST_KINDS: ResistKind[] = ['impact', 'electric', 'thermal'];

/**
 * 방어구: 체력이 아니라 저항(0~1, 받는 피해 × (1−저항))과 이동속도 배율(1 미만 = 페널티)의 교환 관계.
 * 몸통 1 + 보조 1 슬롯. 내구도가 0 이면 효과(저항·페널티) 정지.
 */
export interface ArmorDef {
  id: string;
  slot: 'body' | 'aux';
  resist: Record<ResistKind, number>;
  speedMul: number;
  maxDurability: number;
}

export const ARMORS: Record<string, ArmorDef> = {
  scrap_vest:       { id: 'scrap_vest',       slot: 'body', resist: { impact: 0.15, electric: 0,    thermal: 0.05 }, speedMul: 0.96, maxDurability: 100 },
  plate_vest:       { id: 'plate_vest',       slot: 'body', resist: { impact: 0.35, electric: 0,    thermal: 0.10 }, speedMul: 0.85, maxDurability: 160 },
  rubber_suit:      { id: 'rubber_suit',      slot: 'body', resist: { impact: 0.05, electric: 0.45, thermal: 0.15 }, speedMul: 0.94, maxDurability: 120 },
  shin_guard:       { id: 'shin_guard',       slot: 'aux',  resist: { impact: 0.10, electric: 0,    thermal: 0 },    speedMul: 0.97, maxDurability: 80 },
  insulated_gloves: { id: 'insulated_gloves', slot: 'aux',  resist: { impact: 0,    electric: 0.20, thermal: 0.05 }, speedMul: 1,    maxDurability: 80 },
};
