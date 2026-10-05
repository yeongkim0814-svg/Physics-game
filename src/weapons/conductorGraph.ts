import type { Conductor } from '../core/types';

export interface PropagateOpts {
  /** 구조물·물·금속 몹 사이 전파 거리 (절연 피복이 줄임) */
  linkRadius: number;
  /** 플레이어·절연·일반 몹처럼 "닿아야" 감전되는 대상과의 거리 */
  contactRadius: number;
  /** 홉마다 피해에 곱하는 감쇠 (0..1) */
  falloff: number;
  maxHops: number;
  /** 시작 노드(hop 0)가 받는 피해 */
  baseDamage: number;
}

export interface Hit {
  conductor: Conductor;
  damage: number;
  hop: number;
  /** 전기가 온 노드 (시작 노드는 null) — 번개 시각화용 */
  from: Conductor | null;
}

/** 닿아야 감전되는 종류: 연쇄 반경이 아닌 접촉 반경을 쓴다 */
const LEAF_KINDS = new Set<Conductor['kind']>(['player', 'ally', 'insulator_mob', 'normal_mob']);

/**
 * 전도체 연쇄(BFS). starts 에서 출발해 conducts=true 인 노드만 다음 노드로 전파한다.
 *  - 전도하지 않는 대상(절연/일반 몹)은 맞기만 하고(피해는 받음) 더 이상 전파되지 않는다
 *  - 각 노드는 최단 홉으로 한 번만 맞는다. 피해 = baseDamage × falloff^hop, hop > maxHops 는 제외
 * 부작용 없음: 실제 shock() 호출과 시각화는 호출측이 결과(Hit[])로 수행한다.
 */
export function propagate(starts: Conductor[], all: Conductor[], o: PropagateOpts): Hit[] {
  const hits: Hit[] = [];
  const visited = new Set<Conductor>();
  let frontier: Hit[] = [];
  for (const s of starts) {
    if (visited.has(s)) continue;
    visited.add(s);
    const h: Hit = { conductor: s, damage: o.baseDamage, hop: 0, from: null };
    hits.push(h);
    frontier.push(h);
  }
  for (let hop = 1; hop <= o.maxHops && frontier.length; hop++) {
    const next: Hit[] = [];
    const damage = o.baseDamage * Math.pow(o.falloff, hop);
    for (const src of frontier) {
      if (!src.conductor.conducts) continue;
      for (const c of all) {
        if (visited.has(c)) continue;
        const reach = LEAF_KINDS.has(c.kind) ? o.contactRadius : o.linkRadius;
        if (src.conductor.position.distanceTo(c.position) > reach) continue;
        visited.add(c);
        const h: Hit = { conductor: c, damage, hop, from: src.conductor };
        hits.push(h);
        next.push(h);
      }
    }
    frontier = next;
  }
  return hits;
}
