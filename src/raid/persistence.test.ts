import { describe, expect, it } from 'vitest';
import {
  defaultPersistent,
  beginRaid,
  settleDeath,
  settleExtract,
  repairWeapons,
  totalMaterials,
  addMaterials,
  diffMaterials,
  toStored,
  toState,
  starterWeapon,
  serialize,
  loadPersistent,
  isPersistent,
} from './persistence';
import { BASES } from '../data/bases';
import { PARTS } from '../data/parts';
import { TUNING } from '../config/tuning';
import { createWeaponState } from '../data/loadout';

describe('persistence', () => {
  describe('defaultPersistent', () => {
    it('보관함에 두 베이스의 보급 무기가 있고 소지품은 비어 있다', () => {
      const p = defaultPersistent();
      expect(p.stash.weapons).toHaveLength(2);
      expect(p.stash.weapons[0].loadout.base).toBe('momentum_launcher');
      expect(p.stash.weapons[1].loadout.base).toBe('em_coil');
      expect(p.stash.weapons[0].baseDurability).toBe(BASES['momentum_launcher'].maxDurability);
      expect(p.stash.weapons[1].baseDurability).toBe(BASES['em_coil'].maxDurability);
      expect(p.stash.weapons[0].partDurability).toEqual({});
      expect(p.carried.weapons).toEqual([]);
      expect(p.carried.materials).toEqual({});
    });
  });

  describe('beginRaid', () => {
    it('보관함 무기 전부가 소지품으로 이동하고 보관함은 비워진다', () => {
      const p = defaultPersistent();
      const result = beginRaid(p);
      expect(result.stash.weapons).toHaveLength(0);
      expect(result.carried.weapons).toHaveLength(2);
    });

    it('재료는 키트 제한만큼만 이동하고 보관함에서 같은 양이 줄어든다', () => {
      const p = defaultPersistent();
      const beforeStashMaterials = { ...p.stash.materials };
      const result = beginRaid(p);

      const R = TUNING.raid;
      for (const [id, want] of Object.entries(R.kit)) {
        const taken = Math.min(beforeStashMaterials[id] ?? 0, want);
        expect(result.carried.materials[id]).toBe(taken);
        expect(result.stash.materials[id]).toBe((beforeStashMaterials[id] ?? 0) - taken);
      }
    });

    it('키트 합계가 minKitTotal 미만이면 rationMaterial로 부족분을 채운다', () => {
      const p = defaultPersistent();
      p.stash.materials = {}; // 모든 재료 제거
      const result = beginRaid(p);

      const total = totalMaterials(result.carried.materials);
      const R = TUNING.raid;
      expect(total).toBe(R.minKitTotal);
      expect(result.carried.materials[R.rationMaterial]).toBe(R.minKitTotal);
    });

    it('보관함에 무기가 없어도 두 베이스 모두 보급 무기가 생긴다', () => {
      const p = defaultPersistent();
      p.stash.weapons = [];
      const result = beginRaid(p);

      const bases = result.carried.weapons.map((w) => w.loadout.base).sort();
      expect(bases).toEqual(['em_coil', 'momentum_launcher']);
    });

    it('한 베이스 무기만 있으면 없는 베이스만 보급된다', () => {
      const p = defaultPersistent();
      p.stash.weapons = [p.stash.weapons[0]]; // momentum_launcher만 유지
      const result = beginRaid(p);

      const bases = result.carried.weapons.map((w) => w.loadout.base);
      expect(bases).toContain('momentum_launcher');
      expect(bases).toContain('em_coil'); // 보급된 em_coil
      expect(bases.length).toBe(2);
    });

    it('입력 Persistent를 변조하지 않는다 (불변성)', () => {
      const p = defaultPersistent();
      const original = serialize(p);
      beginRaid(p);
      const after = serialize(p);

      expect(original).toBe(after);
    });

    it('이전 레이드의 잔여 소지품이 있으면 사망으로 처리하고 새 키트를 구성한다', () => {
      const p = defaultPersistent();
      p.carried.weapons = [starterWeapon('momentum_launcher')];
      p.carried.materials = { slag: 5 };

      const result = beginRaid(p);
      expect(result.carried.weapons).toHaveLength(2); // 새로 구성된 위포
      expect(result.carried.materials.slag).not.toBe(5); // 이전 잔여분은 사라짐
    });
  });

  describe('settleDeath', () => {
    it('소지품이 비워지고 lost에 잃은 무기/재료가 담긴다', () => {
      const p = defaultPersistent();
      p.carried.weapons = [starterWeapon('momentum_launcher')];
      p.carried.materials = { slag: 10 };

      const { p: result, lost } = settleDeath(p);
      expect(result.carried.weapons).toEqual([]);
      expect(result.carried.materials).toEqual({});
      expect(lost.weapons).toHaveLength(1);
      expect(lost.materials.slag).toBe(10);
    });

    it('보관함은 그대로 유지된다 (깊은 비교)', () => {
      const p = defaultPersistent();
      const stashBefore = JSON.stringify(p.stash);

      const { p: result } = settleDeath(p);
      expect(JSON.stringify(result.stash)).toBe(stashBefore);
    });
  });

  describe('settleExtract', () => {
    it('소지품의 재료가 보관함 재료에 합산된다', () => {
      const p = defaultPersistent();
      const weapons = [starterWeapon('momentum_launcher')];
      p.carried.weapons = weapons;
      p.carried.materials = { slag: 5, scrap: 3 };
      const stashMaterialsBefore = { ...p.stash.materials };

      const { p: result, carriedOut } = settleExtract(p, weapons);
      expect(result.stash.materials.slag).toBe((stashMaterialsBefore.slag ?? 0) + 5);
      expect(result.stash.materials.scrap).toBe((stashMaterialsBefore.scrap ?? 0) + 3);
      expect(carriedOut).toEqual({ slag: 5, scrap: 3 });
    });

    it('전달한 weapons가 보관함에 추가된다', () => {
      const p = defaultPersistent();
      const w1 = starterWeapon('momentum_launcher');
      const w2 = starterWeapon('em_coil');
      const weapons = [w1, w2];

      const stashWeaponsBefore = p.stash.weapons.length;
      const { p: result } = settleExtract(p, weapons);
      expect(result.stash.weapons).toHaveLength(stashWeaponsBefore + 2);
    });

    it('소지품은 비워진다', () => {
      const p = defaultPersistent();
      p.carried.weapons = [starterWeapon('momentum_launcher')];
      p.carried.materials = { slag: 10 };

      const { p: result } = settleExtract(p, []);
      expect(result.carried.weapons).toEqual([]);
      expect(result.carried.materials).toEqual({});
    });

    it('마모된 내구도 값이 보관함에 그대로 보존된다', () => {
      const p = defaultPersistent();
      const w = starterWeapon('momentum_launcher');
      w.baseDurability = 50;
      w.partDurability = {};

      const { p: result } = settleExtract(p, [w]);
      const storedW = result.stash.weapons[result.stash.weapons.length - 1];
      expect(storedW.baseDurability).toBe(50);
    });
  });

  describe('repairWeapons', () => {
    it('보관함 무기의 baseDurability가 최대치로 복구된다', () => {
      const p = defaultPersistent();
      p.stash.weapons[0].baseDurability = 50;

      const result = repairWeapons(p);
      expect(result.stash.weapons[0].baseDurability).toBe(
        BASES['momentum_launcher'].maxDurability
      );
    });

    it('부품 내구도도 최대치로 복구된다', () => {
      const p = defaultPersistent();
      p.stash.weapons[0].partDurability = { damping_spring: 30 };

      const result = repairWeapons(p);
      expect(result.stash.weapons[0].partDurability.damping_spring).toBe(
        PARTS['damping_spring'].maxDurability
      );
    });

    it('소지품은 건드리지 않는다', () => {
      const p = defaultPersistent();
      p.carried.weapons = [starterWeapon('momentum_launcher')];
      p.carried.weapons[0].baseDurability = 50;

      const result = repairWeapons(p);
      expect(result.carried.weapons[0].baseDurability).toBe(50);
    });
  });

  describe('totalMaterials', () => {
    it('모든 재료의 합을 반환한다', () => {
      const m = { slag: 10, scrap: 5, ingot: 2 };
      expect(totalMaterials(m)).toBe(17);
    });

    it('빈 객체는 0이다', () => {
      expect(totalMaterials({})).toBe(0);
    });
  });

  describe('addMaterials', () => {
    it('두 재료 객체를 합산한다', () => {
      const a = { slag: 10, scrap: 5 };
      const b = { slag: 3, ingot: 2 };
      const result = addMaterials(a, b);

      expect(result.slag).toBe(13);
      expect(result.scrap).toBe(5);
      expect(result.ingot).toBe(2);
    });

    it('원본을 변조하지 않는다', () => {
      const a = { slag: 10 };
      const b = { scrap: 5 };
      addMaterials(a, b);

      expect(a).toEqual({ slag: 10 });
      expect(b).toEqual({ scrap: 5 });
    });
  });

  describe('diffMaterials', () => {
    it('after − before를 계산하고 0인 항목은 제외한다', () => {
      const before = { slag: 10, scrap: 5 };
      const after = { slag: 15, scrap: 5, ingot: 2 };
      const result = diffMaterials(before, after);

      expect(result.slag).toBe(5);
      expect(result.scrap).toBeUndefined();
      expect(result.ingot).toBe(2);
    });
  });

  describe('toStored / toState', () => {
    it('WeaponState → StoredWeapon → WeaponState 왕복 시 charge만 다르다', () => {
      const original = createWeaponState({ base: 'momentum_launcher', parts: {} });
      original.charge = 0.5;

      const stored = toStored(original);
      const recovered = toState(stored);

      expect(recovered.loadout).toEqual(original.loadout);
      expect(recovered.baseDurability).toBe(original.baseDurability);
      expect(recovered.partDurability).toEqual(original.partDurability);
      expect(recovered.charge).toBe(0);
    });

    it('원본을 변조하지 않는다', () => {
      const original = createWeaponState({ base: 'em_coil', parts: {} });
      const originalCopy = JSON.stringify(original);

      toStored(original);
      toState(toStored(original));

      expect(JSON.stringify(original)).toBe(originalCopy);
    });
  });

  describe('serialize / loadPersistent', () => {
    it('serialize → loadPersistent 왕복 시 (소지품이 비어 있다면) 동일하다', () => {
      const p = defaultPersistent();
      const serialized = serialize(p);
      const loaded = loadPersistent(serialized);

      expect(loaded).toEqual(p);
    });

    it('loadPersistent(null) → defaultPersistent', () => {
      const result = loadPersistent(null);
      expect(result).toEqual(defaultPersistent());
    });

    it('손상된 JSON → defaultPersistent', () => {
      const result = loadPersistent('{ invalid json');
      expect(result).toEqual(defaultPersistent());
    });

    it('소지품이 남은 저장본을 로드하면 사망 처리된다', () => {
      const p = defaultPersistent();
      p.carried.weapons = [starterWeapon('momentum_launcher')];
      p.carried.materials = { slag: 10 };
      const stashBefore = JSON.stringify(p.stash);

      const serialized = serialize(p);
      const loaded = loadPersistent(serialized);

      expect(loaded.carried.weapons).toEqual([]);
      expect(loaded.carried.materials).toEqual({});
      expect(JSON.stringify(loaded.stash)).toBe(stashBefore);
    });

    it('형태가 틀린 객체(예: 음수 재료) → defaultPersistent', () => {
      const badData = JSON.stringify({
        stash: { weapons: [], materials: { slag: -1 } },
        carried: { weapons: [], materials: {} },
      });
      const result = loadPersistent(badData);
      expect(result).toEqual(defaultPersistent());
    });
  });

  describe('isPersistent', () => {
    it('올바른 Persistent → true', () => {
      const p = defaultPersistent();
      expect(isPersistent(p)).toBe(true);
    });

    it('잘못된 base → false', () => {
      const p = defaultPersistent();
      (p.stash.weapons[0].loadout as any).base = 'unknown_base';
      expect(isPersistent(p)).toBe(false);
    });

    it('음수 재료 → false', () => {
      const p = defaultPersistent();
      p.stash.materials = { slag: -1 };
      expect(isPersistent(p)).toBe(false);
    });

    it('weapons가 배열이 아님 → false', () => {
      const p = defaultPersistent() as any;
      p.stash.weapons = 'not an array';
      expect(isPersistent(p)).toBe(false);
    });

    it('null → false', () => {
      expect(isPersistent(null)).toBe(false);
    });
  });
});
