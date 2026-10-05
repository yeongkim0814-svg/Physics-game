/**
 * 작업대 레시피. node: 이 지식 노드가 해금돼야 제작 가능 (null = 기초 레시피, 처음부터 가능).
 * 제작은 즉시. out.id 는 data/items.ts 의 아이템.
 */
export interface Recipe {
  id: string;
  node: string | null;
  out: string;
  cost: Record<string, number>;
}

export const RECIPES: Recipe[] = [
  // 기초
  { id: 'r_handle', node: null, out: 'handle', cost: { scrap: 6, slag: 4 } },
  { id: 'r_scope', node: null, out: 'scope', cost: { scrap: 4, copper_wire: 2 } },
  { id: 'r_scrap_vest', node: null, out: 'scrap_vest', cost: { scrap: 12, slag: 6 } },
  { id: 'r_shin_guard', node: null, out: 'shin_guard', cost: { scrap: 8 } },
  // 뉴턴 역학
  { id: 'r_launcher', node: 'newton', out: 'momentum_launcher', cost: { scrap: 20, ingot: 3, spring_steel: 2 } },
  { id: 'r_damping_spring', node: 'newton', out: 'damping_spring', cost: { scrap: 6, spring_steel: 3 } },
  { id: 'r_plate_vest', node: 'newton', out: 'plate_vest', cost: { scrap: 24, ingot: 4 } },
  { id: 'r_analyzer_2', node: 'newton', out: 'analyzer_2', cost: { logic_board: 2, lens: 2, copper_wire: 6, scrap: 10 } },
  // 에너지 보존
  { id: 'r_flywheel', node: 'energy', out: 'flywheel_accumulator', cost: { scrap: 30, ingot: 6, precision_gear: 2 } },
  { id: 'r_analyzer_3', node: 'energy', out: 'analyzer_3', cost: { logic_board: 3, lens: 3, precision_gear: 3, copper_wire: 10, ingot: 4 } },
  // 전자기학
  { id: 'r_em_coil', node: 'em', out: 'em_coil', cost: { copper_wire: 14, magnet_chip: 4, scrap: 12, ingot: 2 } },
  { id: 'r_focus_coil', node: 'em', out: 'focus_coil', cost: { copper_wire: 8, magnet_chip: 2, lens: 1 } },
  { id: 'r_insulated_sheath', node: 'em', out: 'insulated_sheath', cost: { copper_wire: 6, slag: 10 } },
  { id: 'r_rubber_suit', node: 'em', out: 'rubber_suit', cost: { slag: 20, copper_wire: 4 } },
  { id: 'r_insulated_gloves', node: 'em', out: 'insulated_gloves', cost: { slag: 8, copper_wire: 3 } },
  // 상대론 / 양자역학
  { id: 'r_mass_annihilator', node: 'relativity', out: 'mass_annihilator', cost: { ingot: 10, magnet_chip: 6, precision_gear: 4, logic_board: 2 } },
  { id: 'r_tunneling', node: 'quantum', out: 'tunneling_launcher', cost: { ingot: 12, magnet_chip: 8, logic_board: 4, precision_gear: 4, lens: 3 } },
];
