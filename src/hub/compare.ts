import type { BaseId } from '../core/types';
import { RESIST_KINDS, RESIST_LABEL } from '../data/armors';
import type { ItemInstance } from '../inventory/grid';
import { armorStatsOf } from './gear';

/** 스탯 표시 정보. better: 값이 커질 때 이득(up)/손해(down)/상황 따라 다름(neutral = 교환 관계) */
interface StatMeta { label: string; better: 'up' | 'down' | 'neutral'; digits: number; scale?: number; unit?: string }

export const STAT_META: Record<string, StatMeta> = {
  projectileSpeed: { label: '사출 속도', better: 'up', digits: 1, unit: ' m/s' },
  recoil: { label: '반동 배율', better: 'neutral', digits: 2, unit: '×' },
  spreadBase: { label: '기본 퍼짐', better: 'down', digits: 2, scale: 57.2958, unit: '°' },
  fireInterval: { label: '발사 간격', better: 'down', digits: 2, unit: ' s' },
  materialsPerShot: { label: '발당 재료', better: 'down', digits: 1 },
  wearPerRecoil: { label: '마모율(반동)', better: 'down', digits: 4 },
  durabilityCostPerShot: { label: '발당 내구도', better: 'down', digits: 2 },
  maxDamage: { label: '최대 피해', better: 'up', digits: 1 },
  chargeTime: { label: '충전 시간', better: 'down', digits: 2, unit: ' s' },
  arcRange: { label: '사거리', better: 'up', digits: 1, unit: ' m' },
  spread: { label: '퍼짐', better: 'down', digits: 2, scale: 57.2958, unit: '°' },
  chainRadius: { label: '연쇄 반경', better: 'neutral', digits: 1, unit: ' m' },
  leakDamageMul: { label: '누전 피해', better: 'down', digits: 2, unit: '×' },
  wearOvercharge: { label: '마모율(과충전)', better: 'down', digits: 2 },
  meleeDamage: { label: '타격 피해', better: 'up', digits: 1 },
  meleeReach: { label: '타격 사거리', better: 'up', digits: 1, unit: ' m' },
  meleeInterval: { label: '타격 간격', better: 'down', digits: 2, unit: ' s' },
  stability: { label: '안정성', better: 'up', digits: 2 },
  moveSpeedMul: { label: '이동 속도', better: 'up', digits: 2, unit: '×' },
  aimSpeedMul: { label: '조준 속도', better: 'up', digits: 2, unit: '×' },
  fovMul: { label: '시야각', better: 'neutral', digits: 2, unit: '×' },
};

const COMMON = ['stability', 'moveSpeedMul', 'aimSpeedMul', 'fovMul'];
export const BASE_STAT_KEYS: Record<BaseId, string[]> = {
  momentum_launcher: ['projectileSpeed', 'recoil', 'spreadBase', 'fireInterval', 'wearPerRecoil', 'durabilityCostPerShot', ...COMMON],
  em_coil: ['maxDamage', 'chargeTime', 'arcRange', 'spread', 'chainRadius', 'leakDamageMul', 'wearOvercharge', 'durabilityCostPerShot', ...COMMON],
  pocket_launcher: ['projectileSpeed', 'recoil', 'spreadBase', 'fireInterval', 'wearPerRecoil', 'durabilityCostPerShot', ...COMMON],
  impact_blade: ['meleeDamage', 'meleeReach', 'meleeInterval', 'durabilityCostPerShot', ...COMMON],
  flywheel_accumulator: COMMON, mass_annihilator: COMMON, tunneling_launcher: COMMON,
};

export interface CmpRow { label: string; cur: string; next?: string; arrow: string; cls: 'up' | 'down' | 'mid' | 'same' }

const fmt = (m: StatMeta, v: number) => `${(v * (m.scale ?? 1)).toFixed(m.digits)}${m.unit ?? ''}`;

function row(label: string, a: number, b: number | undefined, better: 'up' | 'down' | 'neutral', f: (v: number) => string): CmpRow {
  if (b === undefined || Math.abs(a - b) < 1e-9) return { label, cur: f(a), arrow: '', cls: 'same' };
  const up = b > a;
  const good = better === 'neutral' ? 'mid' : (up === (better === 'up') ? 'up' : 'down');
  return { label, cur: f(a), next: f(b), arrow: up ? '▲' : '▼', cls: good };
}

/** 무기 스탯 비교: base → other (other 없으면 현재 값만). 증가=▲ 색은 이득(초록)/손해(빨강)/교환(호박) */
export function weaponRows(base: BaseId, cur: Record<string, number>, other?: Record<string, number>): CmpRow[] {
  return BASE_STAT_KEYS[base].filter((k) => STAT_META[k] && (k in cur || (other && k in other))).map((k) => {
    const m = STAT_META[k];
    const a = cur[k] ?? (k.endsWith('Mul') ? 1 : 0);
    return row(m.label, a, other ? (other[k] ?? (k.endsWith('Mul') ? 1 : 0)) : undefined, m.better, (v) => fmt(m, v));
  });
}

/** 방어구 비교 (저항 3종 + 이동속도 + 내구도) */
export function armorRows(cur: ItemInstance | undefined, other?: ItemInstance): CmpRow[] {
  const rows: CmpRow[] = [];
  const a = cur ? armorStatsOf(cur) : undefined, b = other ? armorStatsOf(other) : undefined;
  const base = a ?? b;
  if (!base) return rows;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  for (const k of RESIST_KINDS) rows.push(row(`${RESIST_LABEL[k]} 저항`, a?.resist[k] ?? 0, b ? b.resist[k] : undefined, 'up', pct));
  rows.push(row('이동 속도', a?.speedMul ?? 1, b ? b.speedMul : undefined, 'up', (v) => `×${v.toFixed(2)}`));
  rows.push(row('최대 내구도', a?.maxDurability ?? 0, b ? b.maxDurability : undefined, 'up', (v) => String(Math.round(v))));
  return rows;
}

/** 비교 표 HTML. 변화가 있는 줄은 "이전 → 이후 ▲" 로 색과 화살표 표시 */
export function cmpTable(rows: CmpRow[], opts: { onlyChanged?: boolean } = {}): string {
  const list = opts.onlyChanged ? rows.filter((r) => r.next !== undefined) : rows;
  if (!list.length) return '<div class="dim">변화 없음</div>';
  return `<table class="cmp">${list.map((r) =>
    `<tr><td>${r.label}</td><td class="n">${r.next !== undefined ? `<span class="dim">${r.cur}</span> → ` : ''}<span class="ar ${r.cls}">${r.next ?? r.cur} ${r.arrow}</span></td></tr>`).join('')}</table>`;
}
