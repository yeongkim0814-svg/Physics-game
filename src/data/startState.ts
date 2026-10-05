/** 새 게임 시작 재료 (창고) */
export const START_MATERIALS: Record<string, number> = { slag: 30, scrap: 40, ingot: 6 };

/** 허브 새 게임 시작 지급품(창고). 기초 분석기 1개는 필수(닭과 달걀 방지: 샘플을 분석할 수단) */
export const START_ITEMS: { id: string; count?: number }[] = [
  { id: 'momentum_launcher' },
  { id: 'analyzer_1' },
  { id: 'scrap_vest' },
  { id: 'slag', count: START_MATERIALS.slag },
  { id: 'scrap', count: START_MATERIALS.scrap },
  { id: 'ingot', count: START_MATERIALS.ingot },
  { id: 'copper_wire', count: 6 },
];
