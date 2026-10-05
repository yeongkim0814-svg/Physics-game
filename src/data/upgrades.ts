import type { StatMods } from '../core/types';
import type { ResistKind } from './armors';

/**
 * 연구대 개량: 이미 해금된 노드의 "깊이"를 키운다. 레벨마다 perLevel 이 누적(add: 레벨 배, mul: 레벨 제곱)된다.
 * 모든 개량은 장점과 단점이 함께 있다(pros/cons 는 UI 표시용 설명, 실제 효과는 perLevel).
 * 'Mul' 로 끝나는 스탯키·mul 은 곱셈. 스탯키 목록은 data/bases.ts, 표시 정보는 hub/statMeta.ts.
 * cost[i], seconds[i] = (i+1) 레벨로 올리는 데 드는 재료/시간.
 */
export interface UpgradeDef {
  id: string;
  name: string;
  node: string;
  target: 'weapon' | 'part' | 'armor';
  /** 적용 대상 defId (weapon=베이스 id, part=부품 id, armor=방어구 id). 비우면 target 종류 전체 */
  appliesTo: string[];
  maxLevel: number;
  /** weapon/part 용: 무기 스탯 보정 */
  perLevel?: { add?: StatMods; mul?: StatMods };
  /** armor 용: 저항 가산, 이동속도 배율 가산(음수 = 느려짐), 최대 내구도 가산 */
  armorPerLevel?: { resist?: Partial<Record<ResistKind, number>>; speedMul?: number; maxDurability?: number };
  cost: Record<string, number>[];
  seconds: number[];
  pros: string;
  cons: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'launcher_barrel', name: '강선 가공', node: 'newton', target: 'weapon', appliesTo: ['momentum_launcher'], maxLevel: 3,
    perLevel: { mul: { projectileSpeed: 1.08, recoil: 1.07 } },
    cost: [{ scrap: 8, spring_steel: 1 }, { scrap: 14, spring_steel: 2 }, { scrap: 22, spring_steel: 3, ingot: 1 }],
    seconds: [20, 40, 80], pros: '사출 속도↑ (p = mv)', cons: '반동↑ — 같은 운동량 보존이 몸에도 돌아온다',
  },
  {
    id: 'launcher_hardening', name: '표면 경화', node: 'newton', target: 'weapon', appliesTo: ['momentum_launcher'], maxLevel: 3,
    perLevel: { mul: { wearPerRecoil: 0.85, durabilityCostPerShot: 0.9, fireInterval: 1.06 } },
    cost: [{ scrap: 10, slag: 6 }, { scrap: 16, slag: 10 }, { scrap: 24, ingot: 2 }],
    seconds: [20, 40, 80], pros: '마모율↓', cons: '무거워져 연사 간격↑',
  },
  {
    id: 'spring_tuning', name: '스프링 정밀 조율', node: 'newton', target: 'part', appliesTo: ['damping_spring'], maxLevel: 2,
    perLevel: { mul: { recoil: 0.9, spreadBase: 1.1 } },
    cost: [{ spring_steel: 3, scrap: 6 }, { spring_steel: 5, scrap: 10 }],
    seconds: [25, 50], pros: '반동↓', cons: '탄 퍼짐↑',
  },
  {
    id: 'armor_plating', name: '장갑 보강', node: 'newton', target: 'armor', appliesTo: [], maxLevel: 3,
    armorPerLevel: { resist: { impact: 0.05 }, speedMul: -0.03 },
    cost: [{ scrap: 10 }, { scrap: 16, ingot: 1 }, { scrap: 24, ingot: 2 }],
    seconds: [20, 40, 80], pros: '충격 저항↑', cons: '이동속도↓ (질량↑)',
  },
  {
    id: 'coil_winding', name: '권선 증설', node: 'em', target: 'weapon', appliesTo: ['em_coil'], maxLevel: 3,
    perLevel: { mul: { maxDamage: 1.1, chargeTime: 1.08 } },
    cost: [{ copper_wire: 6, magnet_chip: 1 }, { copper_wire: 10, magnet_chip: 2 }, { copper_wire: 16, magnet_chip: 3 }],
    seconds: [30, 60, 120], pros: '최대 피해↑ (B ∝ 감은 수)', cons: '충전 시간↑ (인덕턴스↑)',
  },
  {
    id: 'coil_insulation', name: '절연 강화', node: 'em', target: 'weapon', appliesTo: ['em_coil'], maxLevel: 3,
    perLevel: { mul: { leakDamageMul: 0.8, chainRadius: 0.93 } },
    cost: [{ slag: 10, copper_wire: 3 }, { slag: 16, copper_wire: 5 }, { slag: 24, copper_wire: 8 }],
    seconds: [30, 60, 120], pros: '누전 피해↓', cons: '연쇄 반경↓',
  },
  {
    id: 'coil_cooling', name: '방열 코어', node: 'em', target: 'weapon', appliesTo: ['em_coil'], maxLevel: 2,
    perLevel: { mul: { wearOvercharge: 0.8, arcRange: 0.95 } },
    cost: [{ copper_wire: 8, scrap: 10 }, { copper_wire: 12, ingot: 2 }],
    seconds: [30, 70], pros: '과충전 마모↓', cons: '사거리↓',
  },
  {
    id: 'armor_lining', name: '절연 안감', node: 'em', target: 'armor', appliesTo: [], maxLevel: 3,
    armorPerLevel: { resist: { electric: 0.06, impact: -0.02 } },
    cost: [{ slag: 10, copper_wire: 2 }, { slag: 16, copper_wire: 4 }, { slag: 24, copper_wire: 6 }],
    seconds: [30, 60, 120], pros: '전기 저항↑', cons: '충격 저항↓ (두께 교환)',
  },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
