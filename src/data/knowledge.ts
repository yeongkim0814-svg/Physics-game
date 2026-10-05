/**
 * 지식 노드(물리 갈래 5개). 해금 순서는 order 순(쉬운 순서): 뉴턴 역학(A) → 에너지 보존(C) → 전자기학(B) → 상대론(D) → 양자역학(E).
 * 샘플 1개 = 분석 1회 = "아직 안 열린 노드 중 order 가 가장 낮은 것" 하나를 확정 해금(실패 없음).
 * analyzerTier: 이 노드를 분석하려면 필요한 분석기 단계. 상위 단계는 허브에서 장비 부품으로 제작한다.
 * 잠긴 노드는 지식 트리에서 윤곽만 보인다 → name/blurb/unlocks 는 해금 후에만 UI 에 노출. 샘플 위치 힌트는 데이터에 두지 않는다.
 */
export interface KnowledgeNode {
  id: string;
  /** 해금 순서 (1 부터) */
  order: number;
  name: string;
  /** 대응 베이스 (무기 베이스 id) */
  weaponBase: string;
  weaponName: string;
  analyzerTier: number;
  analyzeSeconds: number;
  /** 이 노드를 해금하는 샘플 아이템 id */
  sampleId: string;
  /** 선행 노드 (모두 해금돼야 분석 가능) */
  requires: string[];
  /** 지식 트리 그림 위치 (0~100 %) */
  pos: { x: number; y: number };
  /** 해금 후 보이는 원리 설명 */
  blurb: string;
}

export const NODES: KnowledgeNode[] = [
  {
    id: 'newton', order: 1, name: '뉴턴 역학', weaponBase: 'momentum_launcher', weaponName: '운동량 사출기',
    analyzerTier: 1, analyzeSeconds: 45, sampleId: 'anomaly_sample', requires: [], pos: { x: 8, y: 50 },
    blurb: '운동량 보존: 쏘아 낸 질량 m·v 만큼 반대 방향으로 반동. 질량과 속도의 교환이 모든 사출 무기의 뼈대다.',
  },
  {
    id: 'energy', order: 2, name: '에너지 보존', weaponBase: 'flywheel_accumulator', weaponName: '플라이휠 축적기',
    analyzerTier: 2, analyzeSeconds: 90, sampleId: 'anomaly_sample', requires: ['newton'], pos: { x: 30, y: 28 },
    blurb: '운동에너지 ½Iω² 를 회전체에 모았다가 한꺼번에 방출. 모으는 시간과 출력의 교환.',
  },
  {
    id: 'em', order: 3, name: '전자기학', weaponBase: 'em_coil', weaponName: '전자기 코일',
    analyzerTier: 2, analyzeSeconds: 150, sampleId: 'anomaly_sample', requires: ['energy'], pos: { x: 52, y: 62 },
    blurb: '전류가 만드는 장과 전도체를 따라 흐르는 전하. 연쇄와 누전은 같은 원리의 양면.',
  },
  {
    id: 'relativity', order: 4, name: '상대론', weaponBase: 'mass_annihilator', weaponName: '질량 소멸기',
    analyzerTier: 3, analyzeSeconds: 240, sampleId: 'anomaly_sample', requires: ['em'], pos: { x: 74, y: 30 },
    blurb: 'E = mc². 질량은 에너지의 다른 모습이다.',
  },
  {
    id: 'quantum', order: 5, name: '양자역학', weaponBase: 'tunneling_launcher', weaponName: '터널링 사출기',
    analyzerTier: 3, analyzeSeconds: 360, sampleId: 'anomaly_sample', requires: ['relativity'], pos: { x: 92, y: 55 },
    blurb: '벽이 에너지 장벽이어도 확률적으로 통과한다.',
  },
];

export const NODE_BY_ID: Record<string, KnowledgeNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
