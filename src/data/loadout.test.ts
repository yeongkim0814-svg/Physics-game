import { describe, expect, it } from 'vitest';
import type { Loadout } from '../core/types';
import { BASES } from './bases';
import { computeStats, createWeaponState, repairAll, validateLoadout, wearDurability } from './loadout';

const A = (parts: Loadout['parts'] = {}): Loadout => ({ base: 'momentum_launcher', parts });
const B = (parts: Loadout['parts'] = {}): Loadout => ({ base: 'em_coil', parts });

describe('computeStats', () => {
  it('부품 없으면 베이스 수치 그대로', () => {
    const r = computeStats(createWeaponState(A()));
    expect(r.stats.recoil).toBe(BASES.momentum_launcher.stats.recoil);
    expect(r.disabled).toBe(false);
  });
  it('감쇠 스프링: 반동↓ 사출 속도↓', () => {
    const base = computeStats(createWeaponState(A())).stats;
    const s = computeStats(createWeaponState(A({ rear: 'damping_spring' }))).stats;
    expect(s.recoil).toBeCloseTo(base.recoil * 0.6);
    expect(s.projectileSpeed).toBeCloseTo(base.projectileSpeed * 0.85);
  });
  it("add 후 mul 순서, Mul 키는 1에서 시작", () => {
    const s = computeStats(createWeaponState(B({ front: 'focus_coil', top: 'scope' }))).stats;
    expect(s.arcRange).toBeCloseTo(BASES.em_coil.stats.arcRange + 10);
    expect(s.chargeTime).toBeCloseTo(BASES.em_coil.stats.chargeTime * 1.4);
    expect(s.aimSpeedMul).toBeCloseTo(1.4);
  });
  it('내구도 0 부품은 효과만 정지, 베이스 0 이면 전체 정지', () => {
    const st = createWeaponState(B({ rear: 'insulated_sheath' }));
    expect(computeStats(st).stats.leakDamageMul).toBeCloseTo(0.4);
    wearDurability(st, 'insulated_sheath', 9999);
    expect(st.partDurability.insulated_sheath).toBe(0);
    const r = computeStats(st);
    expect(r.stats.leakDamageMul).toBe(1);
    expect(r.inactiveParts).toEqual(['insulated_sheath']);
    wearDurability(st, 'base', 9999);
    expect(computeStats(st).disabled).toBe(true);
    repairAll(st);
    expect(computeStats(st).disabled).toBe(false);
    expect(computeStats(st).stats.leakDamageMul).toBeCloseTo(0.4);
  });
  it('내구도 없는 부품은 마모 무시', () => {
    const st = createWeaponState(A({ rear: 'handle' }));
    wearDurability(st, 'handle', 100);
    expect(computeStats(st).inactiveParts).toEqual([]);
  });
});

describe('validateLoadout', () => {
  it('유효/무효 판정', () => {
    expect(validateLoadout(A({ rear: 'damping_spring', top: 'scope' }))).toEqual([]);
    expect(validateLoadout(A({ rear: 'insulated_sheath' }))).toHaveLength(1); // 호환 X
    expect(validateLoadout(A({ front: 'handle' }))).toHaveLength(1); // 슬롯 불일치
    expect(validateLoadout(A({ sub: 'scope' }))).not.toEqual([]); // 부전공 비활성
  });
});
