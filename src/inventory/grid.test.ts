import { describe, expect, it } from 'vitest';
import {
  addItem, canMerge, canPlace, consumeAll, consumeFrom, countOf, findSpot, footprint, isValidGrid,
  itemAt, makeGrid, moveItem, newInstance, placeAt, removeItem, sortGrid, splitStack,
} from './grid';

describe('grid 배치', () => {
  it('회전하면 가로세로가 바뀐다', () => {
    const w = newInstance('momentum_launcher'); // 3×2
    expect(footprint(w, false)).toEqual({ w: 3, h: 2 });
    expect(footprint(w, true)).toEqual({ w: 2, h: 3 });
  });

  it('범위 밖/겹침은 배치 불가, 자기 자신은 무시 가능', () => {
    const g = makeGrid(4, 4);
    const a = newInstance('momentum_launcher');
    expect(canPlace(g, a, 2, 0, false)).toBe(false); // 3칸 폭이 4를 넘음
    expect(canPlace(g, a, 1, 0, false)).toBe(true);
    placeAt(g, a, 0, 0, false);
    const b = newInstance('em_coil');
    expect(canPlace(g, b, 2, 1, false)).toBe(false); // 겹침
    expect(canPlace(g, b, 0, 2, false)).toBe(true);
    expect(canPlace(g, a, 0, 0, true, a.uid)).toBe(true); // 제자리 회전
    expect(canPlace(g, a, 0, 0, true)).toBe(false); // 자기 자신과 겹침
  });

  it('itemAt: 차지한 모든 칸에서 찾는다', () => {
    const g = makeGrid(5, 5);
    const a = newInstance('momentum_launcher');
    placeAt(g, a, 1, 1, false);
    expect(itemAt(g, 3, 2)?.inst.uid).toBe(a.uid);
    expect(itemAt(g, 4, 2)).toBeUndefined();
    expect(itemAt(g, 1, 3)).toBeUndefined();
  });

  it('findSpot: 안 맞으면 회전해서 찾는다', () => {
    const g = makeGrid(2, 3); // 3×2 무기는 회전해야 들어감
    const spot = findSpot(g, newInstance('momentum_launcher'));
    expect(spot).toEqual({ x: 0, y: 0, rot: true });
    expect(findSpot(makeGrid(2, 2), newInstance('momentum_launcher'))).toBeNull();
  });

  it('moveItem: 유효할 때만 이동', () => {
    const g = makeGrid(6, 6);
    const a = newInstance('scope'); // 2×1
    const b = newInstance('scope');
    placeAt(g, a, 0, 0, false);
    placeAt(g, b, 2, 0, false);
    expect(moveItem(g, a.uid, 1, 0, false)).toBe(false);
    expect(moveItem(g, a.uid, 0, 3, true)).toBe(true);
    expect(itemAt(g, 0, 4)?.inst.uid).toBe(a.uid);
  });
});

describe('스택', () => {
  it('addItem: 기존 스택을 채우고 남은 양은 새 칸', () => {
    const g = makeGrid(4, 4);
    addItem(g, newInstance('scrap', 15)); // stack 20
    addItem(g, newInstance('scrap', 10));
    expect(g.placed.map((p) => p.inst.count).sort((a, b) => a - b)).toEqual([5, 20]);
    expect(countOf(g, 'scrap')).toBe(25);
  });

  it('스택 최대치를 넘는 수량은 여러 칸으로 쪼개 들어간다', () => {
    const g = makeGrid(4, 4);
    const rest = addItem(g, { ...newInstance('slag', 1), count: 70 }); // stack 30
    expect(rest).toBeNull();
    expect(g.placed.map((p) => p.inst.count).sort((a, b) => a - b)).toEqual([10, 30, 30]);
  });

  it('공간이 없으면 남은 인스턴스를 돌려준다(부분 성공은 격자에 남는다)', () => {
    const g = makeGrid(1, 1);
    const rest = addItem(g, { ...newInstance('slag', 1), count: 40 });
    expect(rest?.count).toBe(10);
    expect(countOf(g, 'slag')).toBe(30);
  });

  it('획득 출처(found)가 다르면 합쳐지지 않는다', () => {
    const a = newInstance('scrap', 5);
    const b = newInstance('scrap', 5, { found: true });
    expect(canMerge(a, b)).toBe(false);
    expect(canMerge(a, newInstance('scrap', 5))).toBe(true);
    const g = makeGrid(3, 3);
    addItem(g, a); addItem(g, b);
    expect(g.placed).toHaveLength(2);
  });

  it('무기처럼 상태가 있는 아이템은 스택 불가', () => {
    expect(canMerge(newInstance('em_coil'), newInstance('em_coil'))).toBe(false);
  });

  it('splitStack: 일부를 떼어 낸다', () => {
    const a = newInstance('scrap', 12);
    const b = splitStack(a, 5);
    expect(a.count).toBe(7);
    expect(b.count).toBe(5);
    expect(b.uid).not.toBe(a.uid);
    expect(splitStack(a, 99)).toBe(a);
  });

  it('consumeFrom: 들고 온 것부터, 부족하면 변화 없음, 0 이 된 스택은 칸에서 사라진다', () => {
    const g = makeGrid(4, 4);
    addItem(g, newInstance('scrap', 5, { found: true }));
    addItem(g, newInstance('scrap', 3));
    expect(consumeFrom(g, 'scrap', 99)).toBe(false);
    expect(countOf(g, 'scrap')).toBe(8);
    expect(consumeFrom(g, 'scrap', 4)).toBe(true);
    expect(countOf(g, 'scrap', false)).toBe(0);
    expect(countOf(g, 'scrap', true)).toBe(4);
    expect(g.placed).toHaveLength(1);
  });

  it('consumeAll: 하나라도 모자라면 전혀 소모하지 않는다', () => {
    const g = makeGrid(4, 4);
    addItem(g, newInstance('scrap', 10));
    addItem(g, newInstance('slag', 2));
    expect(consumeAll(g, { scrap: 5, slag: 3 })).toBe(false);
    expect(countOf(g, 'scrap')).toBe(10);
    expect(consumeAll(g, { scrap: 5, slag: 2 })).toBe(true);
    expect(countOf(g, 'scrap')).toBe(5);
  });
});

describe('정렬', () => {
  it('아이템을 잃지 않고 스택을 합치며 큰 것부터 채운다', () => {
    const g = makeGrid(6, 6);
    placeAt(g, newInstance('scrap', 5), 5, 5, false);
    placeAt(g, newInstance('scrap', 5), 0, 5, false);
    placeAt(g, newInstance('momentum_launcher'), 3, 3, false);
    const before = countOf(g, 'scrap');
    expect(sortGrid(g)).toBe(true);
    expect(countOf(g, 'scrap')).toBe(before);
    expect(g.placed).toHaveLength(2); // scrap 2스택이 1스택으로
    expect(g.placed[0].inst.defId).toBe('momentum_launcher');
    expect(g.placed[0]).toMatchObject({ x: 0, y: 0 });
    expect(isValidGrid(JSON.parse(JSON.stringify(g)))).toBe(true);
  });
});

describe('저장 검증', () => {
  it('겹치거나 범위 밖이면 무효', () => {
    const g = makeGrid(4, 4);
    placeAt(g, newInstance('scope'), 0, 0, false);
    expect(isValidGrid(JSON.parse(JSON.stringify(g)))).toBe(true);
    placeAt(g, newInstance('scope'), 1, 0, false); // 겹침
    expect(isValidGrid(JSON.parse(JSON.stringify(g)))).toBe(false);
    expect(isValidGrid({ w: 2, h: 2, placed: [{ inst: { uid: 'x', defId: 'nope', count: 1 }, x: 0, y: 0, rot: false }] })).toBe(false);
    expect(isValidGrid(null)).toBe(false);
  });
  it('removeItem', () => {
    const g = makeGrid(3, 3);
    const a = newInstance('scope');
    placeAt(g, a, 0, 0, false);
    expect(removeItem(g, a.uid)?.inst.uid).toBe(a.uid);
    expect(g.placed).toHaveLength(0);
  });
});
