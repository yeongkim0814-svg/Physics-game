/** 연구 장비: 마모 없이 영구. 분석기는 창고에 있는 것 중 최고 tier 가 쓰인다 */
export interface EquipmentDef { id: string; type: 'analyzer'; tier: number }
export const EQUIPMENT: Record<string, EquipmentDef> = {
  analyzer_1: { id: 'analyzer_1', type: 'analyzer', tier: 1 },
  analyzer_2: { id: 'analyzer_2', type: 'analyzer', tier: 2 },
  analyzer_3: { id: 'analyzer_3', type: 'analyzer', tier: 3 },
};
