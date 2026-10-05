import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { propagate, type PropagateOpts } from './conductorGraph';
import type { Conductor } from '../core/types';

/**
 * 테스트용 Conductor 생성 헬퍼
 */
function createConductor(
  x: number,
  y: number,
  z: number,
  kind: Conductor['kind'],
  conducts: boolean = true,
  radius: number = 1.0
): Conductor {
  return {
    position: new THREE.Vector3(x, y, z),
    kind,
    conducts,
    radius,
    shock: vi.fn(),
  };
}

describe('conductorGraph', () => {
  describe('propagate', () => {
    const defaultOpts: PropagateOpts = {
      linkRadius: 6.0,
      contactRadius: 2.5,
      falloff: 0.8,
      maxHops: 10,
      baseDamage: 100,
    };

    it('시작 노드는 hop 0, 피해=baseDamage, from=null', () => {
      const start = createConductor(0, 0, 0, 'metal_mob');
      const hits = propagate([start], [start], defaultOpts);

      expect(hits).toHaveLength(1);
      expect(hits[0].conductor).toBe(start);
      expect(hits[0].hop).toBe(0);
      expect(hits[0].damage).toBe(100);
      expect(hits[0].from).toBeNull();
    });

    it('일직선 금속 노드 4개: 간격 5, linkRadius 6 → hop 0,1,2,3과 falloff 감쇠', () => {
      const nodes = [
        createConductor(0, 0, 0, 'metal_mob'),   // hop 0
        createConductor(5, 0, 0, 'metal_mob'),   // hop 1, 거리 5
        createConductor(10, 0, 0, 'metal_mob'),  // hop 2, 거리 5
        createConductor(15, 0, 0, 'metal_mob'),  // hop 3, 거리 5
      ];

      const opts: PropagateOpts = {
        linkRadius: 6.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const hits = propagate([nodes[0]], nodes, opts);

      expect(hits).toHaveLength(4);
      expect(hits[0]).toMatchObject({
        hop: 0,
        damage: 100,
      });
      expect(hits[1]).toMatchObject({
        hop: 1,
        damage: 80, // 100 * 0.8
      });
      expect(hits[2]).toMatchObject({
        hop: 2,
      });
      expect(hits[2].damage).toBeCloseTo(64, 5); // 100 * 0.8^2 (부동소수점 오차 허용)
      expect(hits[3]).toMatchObject({
        hop: 3,
      });
      expect(hits[3].damage).toBeCloseTo(51.2, 5); // 100 * 0.8^3
    });

    it('간격이 linkRadius보다 크면 전파가 끊긴다', () => {
      const nodes = [
        createConductor(0, 0, 0, 'metal_mob'),
        createConductor(10, 0, 0, 'metal_mob'), // 거리 10 > linkRadius 6
      ];

      const hits = propagate([nodes[0]], nodes, defaultOpts);

      // 시작 노드만 Hit에 포함, 두 번째는 닿지 않음
      expect(hits).toHaveLength(1);
      expect(hits[0].conductor).toBe(nodes[0]);
    });

    it('maxHops 제한: maxHops=2 면 hop 3 이상은 제외', () => {
      const nodes = [
        createConductor(0, 0, 0, 'metal_mob'),
        createConductor(5, 0, 0, 'metal_mob'),
        createConductor(10, 0, 0, 'metal_mob'),
        createConductor(15, 0, 0, 'metal_mob'),
      ];

      const opts: PropagateOpts = {
        ...defaultOpts,
        maxHops: 2,
      };

      const hits = propagate([nodes[0]], nodes, opts);

      // hop 0, 1, 2만 포함
      expect(hits).toHaveLength(3);
      expect(hits.map((h) => h.hop)).toEqual([0, 1, 2]);
    });

    it('비전도체(insulator_mob)는 Hit에 포함되지만 그 너머로 전파되지 않음', () => {
      const nodes = [
        createConductor(0, 0, 0, 'metal_mob'),
        createConductor(2, 0, 0, 'insulator_mob', false), // 비전도체, contactRadius 내 (거리 2 < 2.5)
        createConductor(7, 0, 0, 'metal_mob'), // metal1에서 직접 도달 불가 (거리 7 > linkRadius 6)
      ];

      const hits = propagate([nodes[0]], nodes, defaultOpts);

      // metal_mob(0) → insulator_mob(2, contactRadius 판정, 거리 2 < 2.5)
      // insulator_mob은 conducts=false이므로 metal_mob(7)로 전파되지 않음
      expect(hits).toHaveLength(2);
      expect(hits[0].conductor).toBe(nodes[0]);
      expect(hits[1].conductor).toBe(nodes[1]); // insulator는 포함
      expect(hits[1].hop).toBe(1);
    });

    it('접촉 반경: player는 contactRadius, metal_mob은 linkRadius로 판정', () => {
      const opts: PropagateOpts = {
        linkRadius: 6.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const metal = createConductor(0, 0, 0, 'metal_mob');
      const player = createConductor(2, 0, 0, 'player', true);
      const metal2 = createConductor(7, 0, 0, 'metal_mob');

      const hits = propagate([metal], [metal, player, metal2], opts);

      // metal(0) → player(2는 contactRadius=2.5로 판정, 거리 2 < 2.5 → Hit 포함)
      // → metal2(7은 linkRadius=6으로 판정, 거리 5 < 6 → Hit 포함)
      const hitConductors = hits.map((h) => h.conductor.kind);
      expect(hitConductors).toContain('player');
      expect(hitConductors).toContain('metal_mob');
    });

    it('접촉 반경: player의 contactRadius로 닿지 않으면 Hit 제외', () => {
      const opts: PropagateOpts = {
        linkRadius: 6.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const metal = createConductor(0, 0, 0, 'metal_mob');
      const player = createConductor(4, 0, 0, 'player', true); // 거리 4 > contactRadius 2.5

      const hits = propagate([metal], [metal, player], opts);

      // player는 contactRadius로 판정되고 거리 4 > 2.5이므로 Hit에 포함 안 됨
      expect(hits).toHaveLength(1);
      expect(hits[0].conductor).toBe(metal);
    });

    it('각 노드는 한 번만 (중복 없음)', () => {
      const node1 = createConductor(0, 0, 0, 'metal_mob');
      const node2 = createConductor(5, 0, 0, 'metal_mob');

      const hits = propagate([node1], [node1, node2], defaultOpts);

      // 모든 conductor가 unique한지 확인
      const conductorSet = new Set(hits.map((h) => h.conductor));
      expect(conductorSet.size).toBe(hits.length);
    });

    it('두 경로가 있으면 최단 홉 피해를 받음 (다이아몬드 배치)', () => {
      // node1 ← node2 (경로1: hop 1)
      // node1 ← node3 ← node2 (경로2: hop 2)
      // 다이아몬드: node2가 node1에 두 경로로 도달할 수 있음
      const node1 = createConductor(0, 0, 0, 'metal_mob');
      const node2 = createConductor(5, 0, 0, 'metal_mob');  // hop 1
      const node3 = createConductor(2.5, 5, 0, 'metal_mob'); // hop 1도 가능

      const opts: PropagateOpts = {
        linkRadius: 10.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const hits = propagate([node1], [node1, node2, node3], opts);

      // node2는 한 번만 Hit에 포함되어야 하고, 최단 hop으로
      const node2Hit = hits.find((h) => h.conductor === node2);
      expect(node2Hit).toBeDefined();
      expect(node2Hit?.hop).toBeLessThanOrEqual(2);
    });

    it('플레이어(conducts=true)가 전도체로 참여해 그 너머로 전파', () => {
      const metal1 = createConductor(0, 0, 0, 'metal_mob');
      const player = createConductor(2, 0, 0, 'player', true); // 전도 플레이어, contactRadius 내 (거리 2 < 2.5)
      const metal2 = createConductor(7, 0, 0, 'metal_mob'); // metal1에서 직접 도달 불가 (거리 7 > linkRadius 6), player에서는 도달 가능 (거리 5 < linkRadius 6)

      const opts: PropagateOpts = {
        linkRadius: 6.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const hits = propagate([metal1], [metal1, player, metal2], opts);

      // metal1(hop 0) → player(hop 1, contactRadius 판정) → metal2(hop 2, linkRadius 판정)
      expect(hits.length).toBe(3);
      const hitKinds = hits.map((h) => h.conductor.kind);
      expect(hitKinds).toContain('player');
      expect(hitKinds).toContain('metal_mob');

      const metal2Hit = hits.find((h) => h.conductor === metal2);
      expect(metal2Hit?.hop).toBe(2);
    });

    it('순수성: propagate가 shock을 호출하지 않음', () => {
      const node1 = createConductor(0, 0, 0, 'metal_mob');
      const node2 = createConductor(5, 0, 0, 'metal_mob');

      const hits = propagate([node1], [node1, node2], defaultOpts);

      // shock이 호출되지 않았는지 확인
      for (const hit of hits) {
        expect(hit.conductor.shock).not.toHaveBeenCalled();
      }
    });

    it('여러 시작 노드에서 각각 hop 0으로 시작', () => {
      const node1 = createConductor(0, 0, 0, 'metal_mob');
      const node2 = createConductor(100, 0, 0, 'metal_mob');
      const node3 = createConductor(3, 0, 0, 'metal_mob');

      const opts: PropagateOpts = {
        linkRadius: 3.5,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const hits = propagate([node1, node2], [node1, node2, node3], opts);

      // node1과 node2는 각각 hop 0
      const node1Hit = hits.find((h) => h.conductor === node1);
      const node2Hit = hits.find((h) => h.conductor === node2);

      expect(node1Hit?.hop).toBe(0);
      expect(node2Hit?.hop).toBe(0);
      expect(node1Hit?.from).toBeNull();
      expect(node2Hit?.from).toBeNull();
    });

    it('from 필드는 시작 노드는 null, 나머지는 전파 출처 노드', () => {
      const node1 = createConductor(0, 0, 0, 'metal_mob');
      const node2 = createConductor(5, 0, 0, 'metal_mob');

      const hits = propagate([node1], [node1, node2], defaultOpts);

      const node1Hit = hits.find((h) => h.conductor === node1);
      const node2Hit = hits.find((h) => h.conductor === node2);

      expect(node1Hit?.from).toBeNull();
      expect(node2Hit?.from).toBe(node1);
    });

    it('normal_mob(비전도체)는 contactRadius로 판정되고 conducts=false인 경우 전파하지 않음', () => {
      const metal1 = createConductor(0, 0, 0, 'metal_mob');
      const normal = createConductor(2, 0, 0, 'normal_mob', false); // 비전도체, contactRadius 내 (거리 2 < 2.5)
      const metal2 = createConductor(7, 0, 0, 'metal_mob'); // normal 너머, metal1에서 직접 도달 불가 (거리 7 > linkRadius 6)

      const opts: PropagateOpts = {
        linkRadius: 6.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const hits = propagate([metal1], [metal1, normal, metal2], opts);

      // metal1(0) → normal(2, contactRadius 판정, 거리 2 < 2.5) → 멈춤
      // normal은 conducts=false이므로 metal2(7)로 전파 안 됨
      // metal2는 metal1에서 직접 거리 7 > linkRadius이므로 도달 불가
      expect(hits).toHaveLength(2);
      const normalHit = hits.find((h) => h.conductor === normal);
      const metal2Hit = hits.find((h) => h.conductor === metal2);

      expect(normalHit).toBeDefined();
      expect(normalHit?.hop).toBe(1);
      expect(metal2Hit).toBeUndefined(); // metal2는 도달할 수 없음
    });

    it('water(전도체)는 linkRadius로 판정되고 그 너머로 전파됨', () => {
      const metal1 = createConductor(0, 0, 0, 'metal_mob');
      const water = createConductor(5, 0, 0, 'water', true);
      const metal2 = createConductor(10, 0, 0, 'metal_mob');

      const opts: PropagateOpts = {
        linkRadius: 6.0,
        contactRadius: 2.5,
        falloff: 0.8,
        maxHops: 10,
        baseDamage: 100,
      };

      const hits = propagate([metal1], [metal1, water, metal2], opts);

      // metal1(0) → water(5, linkRadius 판정, 거리 5 < 6) → metal2(10, 거리 5 < 6)
      expect(hits.length).toBe(3);
      const metal2Hit = hits.find((h) => h.conductor === metal2);
      expect(metal2Hit?.hop).toBe(2);
    });
  });
});
