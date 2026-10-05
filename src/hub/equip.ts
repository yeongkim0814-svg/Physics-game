import { ARMOR_SLOTS, type ArmorSlot } from '../data/armors';
import { CONTAINER_SLOTS, type ContainerSlot } from '../data/containers';
import { WEAPON_SLOTS, type WeaponSlot } from '../data/weaponSlots';
import { allInstances, type Grid, type ItemInstance } from '../inventory/grid';

/** 장착 장비: 무기 칸 4 · 헬멧/방어구 · 조끼/가방(보관 장비). 헤드셋 등 그 밖의 칸은 없다 */
export interface Equip {
  weapons: Partial<Record<WeaponSlot, ItemInstance>>;
  armor: Partial<Record<ArmorSlot, ItemInstance>>;
  containers: Partial<Record<ContainerSlot, ItemInstance>>;
}
/** 들고 갈 수 있는 격자: 주머니(항상) + 장착한 조끼/가방이 제공하는 격자 */
export interface Carry { pockets: Grid; vest: Grid | null; backpack: Grid | null }

export const emptyEquip = (): Equip => ({ weapons: {}, armor: {}, containers: {} });

const pick = <K extends string>(keys: K[], rec: Partial<Record<K, ItemInstance>>) => keys.map((k) => rec[k]).filter((x): x is ItemInstance => !!x);

/** 슬롯 순서대로 (레이드 WPN 전환 순서) */
export const weaponList = (e: Equip) => pick(WEAPON_SLOTS.map((s) => s.id), e.weapons);
export const armorList = (e: Equip) => pick(ARMOR_SLOTS, e.armor);
export const containerList = (e: Equip) => pick(CONTAINER_SLOTS, e.containers);
/** 장착한 모든 아이템 (무기+방어구+보관 장비) */
export const equippedItems = (e: Equip) => [...weaponList(e), ...armorList(e), ...containerList(e)];

export const carryGrids = (c: Carry): Grid[] => [c.pockets, c.vest, c.backpack].filter((g): g is Grid => !!g);
export const carryItems = (c: Carry): ItemInstance[] => carryGrids(c).flatMap((g) => allInstances(g));
