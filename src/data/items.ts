import { MATERIALS } from './materials';

/** 아이템 분류 7종 */
export type ItemKind = 'material' | 'sample' | 'weapon_base' | 'weapon_part' | 'armor' | 'equipment' | 'equipment_part';

export const KIND_LABEL: Record<ItemKind, string> = {
  material: '재료', sample: '샘플', weapon_base: '무기 베이스', weapon_part: '무기 부품',
  armor: '방어구', equipment: '연구 장비', equipment_part: '장비 부품',
};

/**
 * 아이템 정적 정의. 칸 크기 w×h(회전 가능), stack = 한 칸 묶음 최대 수량(1 = 스택 안 됨).
 * id 규칙: weapon_base 는 BaseId, weapon_part 는 PARTS 의 id, armor 는 ARMORS 의 id, equipment 는 EQUIPMENT 의 id 와 같다.
 * 칸 크기·스택은 여기만 고치면 된다.
 */
export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  w: number;
  h: number;
  stack: number;
  color: number;
  desc?: string;
}

const mat = (id: keyof typeof MATERIALS, stack: number, desc: string): ItemDef => ({
  id, name: MATERIALS[id].name, kind: 'material', w: 1, h: 1, stack, color: MATERIALS[id].color, desc,
});

const LIST: ItemDef[] = [
  // --- 재료: 사출기 탄(질량 있음) ---
  mat('slag', 30, '가벼운 탄. 질량 1kg'),
  mat('scrap', 20, '기본 탄·제작 재료. 질량 2kg'),
  mat('ingot', 10, '무거운 탄·고급 제작 재료. 질량 4kg'),
  // --- 재료: 연구 전용 ---
  { id: 'copper_wire', name: '구리선', kind: 'material', w: 1, h: 1, stack: 20, color: 0xc87533, desc: '코일·전자기 계열 제작/개량 재료' },
  { id: 'magnet_chip', name: '자석 조각', kind: 'material', w: 1, h: 1, stack: 10, color: 0x9aa0c8, desc: '전자기·고급 장비 재료' },
  { id: 'spring_steel', name: '스프링강', kind: 'material', w: 1, h: 1, stack: 10, color: 0x7ea3b5, desc: '탄성 부품·개량 재료' },
  // --- 샘플(미분석) ---
  { id: 'anomaly_sample', name: '이상 현상 샘플', kind: 'sample', w: 1, h: 1, stack: 5, color: 0xd070e0, desc: '분석기에 넣으면 새 지식 노드가 해금된다' },
  // --- 무기 베이스 ---
  { id: 'momentum_launcher', name: '운동량 사출기', kind: 'weapon_base', w: 3, h: 2, stack: 1, color: 0x8c8f82, desc: '질량 덩어리를 쏘고 반동으로 움직인다' },
  { id: 'em_coil', name: '전자기 코일', kind: 'weapon_base', w: 3, h: 2, stack: 1, color: 0xd89a2e, desc: '충전해 전기를 방출, 전도체로 연쇄' },
  { id: 'flywheel_accumulator', name: '플라이휠 축적기', kind: 'weapon_base', w: 3, h: 2, stack: 1, color: 0x6fc4c0, desc: '(레이드 동작 미구현) 에너지 축적형' },
  { id: 'mass_annihilator', name: '질량 소멸기', kind: 'weapon_base', w: 4, h: 2, stack: 1, color: 0xe06060, desc: '(레이드 동작 미구현) 질량-에너지 변환형' },
  { id: 'tunneling_launcher', name: '터널링 사출기', kind: 'weapon_base', w: 4, h: 2, stack: 1, color: 0x9070e0, desc: '(레이드 동작 미구현) 확률적 관통형' },
  // --- 무기 부품 ---
  { id: 'handle', name: '손잡이', kind: 'weapon_part', w: 1, h: 2, stack: 1, color: 0x59603f },
  { id: 'scope', name: '조준기', kind: 'weapon_part', w: 2, h: 1, stack: 1, color: 0x7b816b },
  { id: 'damping_spring', name: '감쇠 스프링', kind: 'weapon_part', w: 1, h: 2, stack: 1, color: 0x7ea3b5 },
  { id: 'focus_coil', name: '집속 코일', kind: 'weapon_part', w: 2, h: 1, stack: 1, color: 0xc87533 },
  { id: 'insulated_sheath', name: '절연 피복', kind: 'weapon_part', w: 1, h: 2, stack: 1, color: 0x2c2e29 },
  // --- 방어구 ---
  { id: 'scrap_vest', name: '고철 조끼', kind: 'armor', w: 2, h: 3, stack: 1, color: 0x59603f, desc: '몸통. 싸고 가볍다' },
  { id: 'plate_vest', name: '장갑판 조끼', kind: 'armor', w: 2, h: 3, stack: 1, color: 0x8c8f82, desc: '몸통. 충격에 강하지만 느려진다' },
  { id: 'rubber_suit', name: '고무 절연복', kind: 'armor', w: 2, h: 3, stack: 1, color: 0x363d2a, desc: '몸통. 전기에 강하지만 충격에 약하다' },
  { id: 'shin_guard', name: '정강이 보호대', kind: 'armor', w: 2, h: 2, stack: 1, color: 0x7b816b, desc: '보조. 낙하·충격 약간 경감' },
  { id: 'insulated_gloves', name: '절연 장갑', kind: 'armor', w: 2, h: 1, stack: 1, color: 0x2e3228, desc: '보조. 누전·감전 경감' },
  // --- 연구 장비 (영구, 마모 없음) ---
  { id: 'analyzer_1', name: '기초 분석기', kind: 'equipment', w: 2, h: 2, stack: 1, color: 0x6fc4c0, desc: '분석기 1단계' },
  { id: 'analyzer_2', name: '정밀 분석기', kind: 'equipment', w: 2, h: 2, stack: 1, color: 0x7fbf6a, desc: '분석기 2단계' },
  { id: 'analyzer_3', name: '고에너지 분석기', kind: 'equipment', w: 2, h: 3, stack: 1, color: 0xd89a2e, desc: '분석기 3단계' },
  // --- 연구 장비 부품 ---
  { id: 'lens', name: '광학 렌즈', kind: 'equipment_part', w: 1, h: 1, stack: 5, color: 0x9fe0e0, desc: '상위 분석기 부품' },
  { id: 'logic_board', name: '논리 기판', kind: 'equipment_part', w: 1, h: 1, stack: 5, color: 0x4a8a4a, desc: '상위 분석기 부품' },
  { id: 'precision_gear', name: '정밀 기어', kind: 'equipment_part', w: 1, h: 1, stack: 5, color: 0xb0a070, desc: '상위 장비·고급 베이스 부품' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item: ${id}`);
  return d;
}
export const isStackable = (id: string) => itemDef(id).stack > 1;
