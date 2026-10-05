import { describe, expect, it } from 'vitest';
import { TUNING } from '../config/tuning';
import { START_ITEMS } from './startState';
import { ARMORS } from './armors';
import { BASES } from './bases';
import { EQUIPMENT } from './equipment';
import { ITEMS } from './items';
import { NODES, NODE_BY_ID } from './knowledge';
import { MAP } from './map';
import { PARTS } from './parts';
import { RECIPES } from './recipes';
import { UPGRADES } from './upgrades';
import { addItem, makeGrid } from '../inventory/grid';
import { createItem } from '../hub/gear';

// 데이터 파일(JSON/TS 객체)만 고쳐서 조정할 수 있도록, 참조 무결성을 한 번에 검사한다.
describe('데이터 무결성', () => {
  it('아이템 정의: 크기 ≥ 1, 스택 ≥ 1, 종류별 참조 대상이 존재', () => {
    for (const d of Object.values(ITEMS)) {
      expect(d.w, d.id).toBeGreaterThanOrEqual(1);
      expect(d.h, d.id).toBeGreaterThanOrEqual(1);
      expect(d.stack, d.id).toBeGreaterThanOrEqual(1);
      if (d.kind === 'weapon_base') expect(BASES[d.id as keyof typeof BASES], d.id).toBeTruthy();
      if (d.kind === 'weapon_part') expect(PARTS[d.id], d.id).toBeTruthy();
      if (d.kind === 'armor') expect(ARMORS[d.id], d.id).toBeTruthy();
      if (d.kind === 'equipment') expect(EQUIPMENT[d.id], d.id).toBeTruthy();
    }
    // 반대 방향: 베이스/부품/방어구/장비 정의마다 아이템이 있다
    for (const id of [...Object.keys(BASES), ...Object.keys(PARTS), ...Object.keys(ARMORS), ...Object.keys(EQUIPMENT)]) expect(ITEMS[id], id).toBeTruthy();
  });

  it('아이템 분류 7종이 모두 쓰인다', () => {
    const kinds = new Set(Object.values(ITEMS).map((d) => d.kind));
    expect([...kinds].sort()).toEqual(['armor', 'equipment', 'equipment_part', 'material', 'sample', 'weapon_base', 'weapon_part']);
  });

  it('레시피: 산출물과 재료가 존재하고 노드 id 가 유효', () => {
    for (const r of RECIPES) {
      expect(ITEMS[r.out], r.id).toBeTruthy();
      if (r.node) expect(NODE_BY_ID[r.node], r.id).toBeTruthy();
      for (const id of Object.keys(r.cost)) expect(ITEMS[id], `${r.id}:${id}`).toBeTruthy();
    }
    // 노드마다 무기 베이스 레시피가 있다 (해금 흐름)
    for (const n of NODES) expect(RECIPES.some((r) => r.node === n.id && r.out === n.weaponBase), n.id).toBe(true);
  });

  it('개량: 노드 유효, 비용/시간 배열 길이 = 최대 레벨, 대상 id 유효', () => {
    for (const u of UPGRADES) {
      expect(NODE_BY_ID[u.node], u.id).toBeTruthy();
      expect(u.cost, u.id).toHaveLength(u.maxLevel);
      expect(u.seconds, u.id).toHaveLength(u.maxLevel);
      for (const c of u.cost) for (const id of Object.keys(c)) expect(ITEMS[id], `${u.id}:${id}`).toBeTruthy();
      expect(!!u.perLevel !== !!u.armorPerLevel, u.id).toBe(true);
      for (const id of u.appliesTo) expect(ITEMS[id], `${u.id}:${id}`).toBeTruthy();
      // 장단점: 모든 개량은 이득과 손해를 함께 가진다
      expect(u.pros && u.cons, u.id).toBeTruthy();
    }
  });

  it('지식 노드: 5개, 순서 1..5, 선행 노드 유효(순환 없음), 샘플 아이템은 sample 종류, 베이스 존재', () => {
    expect(NODES.map((n) => n.id)).toEqual(['newton', 'energy', 'em', 'relativity', 'quantum']);
    expect(NODES.map((n) => n.weaponBase)).toEqual(['momentum_launcher', 'flywheel_accumulator', 'em_coil', 'mass_annihilator', 'tunneling_launcher']);
    NODES.forEach((n, i) => {
      expect(n.order).toBe(i + 1);
      for (const r of n.requires) expect(NODE_BY_ID[r].order).toBeLessThan(n.order);
      expect(ITEMS[n.sampleId].kind).toBe('sample');
      expect(BASES[n.weaponBase as keyof typeof BASES]).toBeTruthy();
    });
  });

  it('상위 노드일수록 분석기 단계가 낮아지지 않는다, 최고 단계 분석기를 제작할 수 있다', () => {
    for (let i = 1; i < NODES.length; i++) expect(NODES[i].analyzerTier).toBeGreaterThanOrEqual(NODES[i - 1].analyzerTier);
    const tiers = Object.values(EQUIPMENT).map((e) => e.tier);
    expect(Math.max(...tiers)).toBeGreaterThanOrEqual(Math.max(...NODES.map((n) => n.analyzerTier)));
    // 첫 노드는 지급된 기초 분석기로 분석 가능 (닭과 달걀 방지)
    expect(NODES[0].analyzerTier).toBeLessThanOrEqual(1);
    expect(START_ITEMS.some((i) => i.id === 'analyzer_1')).toBe(true);
    // 분석기 N 단계 제작 레시피는 N−1 단계가 필요한 노드 이전에 열린다
    for (const [id, e] of Object.entries(EQUIPMENT)) {
      if (e.tier < 2) continue;
      const r = RECIPES.find((x) => x.out === id)!;
      const need = NODES.filter((n) => n.analyzerTier === e.tier)[0];
      expect(NODE_BY_ID[r.node!].order, id).toBeLessThan(need.order);
    }
  });

  it('맵 전리품 아이템 id 유효, 이상 현상 샘플 1종이 배치됨, 연구 재료가 배치됨', () => {
    const ids = new Set<string>();
    for (const l of MAP.loot) for (const id of Object.keys(l.materials)) { expect(ITEMS[id], id).toBeTruthy(); ids.add(id); }
    expect(ids.has('anomaly_sample')).toBe(true);
    for (const id of ['copper_wire', 'magnet_chip', 'spring_steel', 'lens', 'logic_board', 'precision_gear']) expect(ids.has(id), id).toBe(true);
    // 샘플은 1종만
    expect([...ids].filter((id) => ITEMS[id].kind === 'sample')).toEqual(['anomaly_sample']);
  });

  it('시작 지급품이 창고에 다 들어가고, 큰 아이템도 가방/안전 보관함 크기 설정에 맞게 들어갈 수 있다', () => {
    const g = makeGrid(TUNING.hub.grid.stash.w, TUNING.hub.grid.stash.h);
    for (const it of START_ITEMS) expect(addItem(g, createItem(it.id, it.count ?? 1)), it.id).toBeNull();
    const bag = makeGrid(TUNING.hub.grid.bag.w, TUNING.hub.grid.bag.h);
    for (const id of Object.keys(BASES)) expect(addItem(bag, createItem(id)), id).toBeNull(); // 가장 큰 무기도 가방에 들어간다
  });

  it('안전 보관함(작은 격자)에 샘플·장비 부품 같은 작은 획득품이 들어간다', () => {
    const safe = makeGrid(TUNING.hub.grid.safe.w, TUNING.hub.grid.safe.h);
    expect(addItem(safe, createItem('anomaly_sample', 2, { found: true }))).toBeNull();
    expect(addItem(safe, createItem('logic_board', 1, { found: true }))).toBeNull();
  });

  it('방어구: 저항 0~1, 이동속도 ≤ 1 (페널티), 내구도 > 0', () => {
    for (const a of Object.values(ARMORS)) {
      for (const r of Object.values(a.resist)) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(1); }
      expect(a.speedMul).toBeLessThanOrEqual(1);
      expect(a.maxDurability).toBeGreaterThan(0);
    }
    // 교환 관계: 가장 단단한 방어구는 가장 느리다
    const sorted = Object.values(ARMORS).filter((a) => a.slot === 'body').sort((x, y) => y.resist.impact - x.resist.impact);
    expect(sorted[0].speedMul).toBe(Math.min(...sorted.map((a) => a.speedMul)));
  });

  it('C·D·E 는 레이드 미구현 표시, A·B 는 구현됨', () => {
    expect(BASES.momentum_launcher.implemented && BASES.em_coil.implemented).toBe(true);
    for (const id of ['flywheel_accumulator', 'mass_annihilator', 'tunneling_launcher'] as const) expect(BASES[id].implemented).toBe(false);
  });
});
