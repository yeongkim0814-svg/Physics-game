/**
 * 복셀 데이터 코덱 (THREE 비의존, 단위 테스트 대상). 규약은 scripts/carve_character.py 와 동일:
 * 심볼 = (부위 id << SYMBOL_PART_SHIFT) | 팔레트 색 번호(1.., 0 = 빈칸). 순서 = y(아래→위) 바깥, z(앞→뒤), x(왼쪽→오른쪽) 안쪽.
 * (심볼, 연속 길이) 쌍을 LEB128 varint 로 쓰고 base64 로 감싼다.
 */
export const SYMBOL_PART_SHIFT = 6;
export const SYMBOL_COLOR_MASK = (1 << SYMBOL_PART_SHIFT) - 1;

export type V3 = readonly [number, number, number];

/** 스크립트가 내보내는 JSON 형식 */
export interface VoxelFile {
  version: number;
  size: V3;               // nx, ny, nz
  voxelSize: number;      // m
  origin: V3;             // 격자 인덱스 → 월드: (index - origin) * voxelSize 가 셀 중심. x 오른쪽 +, z 뒤 +, y 위 +
  parts: readonly string[];
  palette: readonly string[]; // 'rrggbb', 색 번호 1.. 이 palette[번호-1]
  emissive: readonly number[]; // 발광 색 번호 목록
  pivots: Readonly<Record<string, V3>>;
  rle: string;
}

export interface VoxelGrid {
  nx: number; ny: number; nz: number;
  /** 부위 id (0 = 빈칸) */
  part: Uint8Array;
  /** 팔레트 색 번호 (0 = 빈칸) */
  color: Uint8Array;
}

export const voxelIndex = (g: { nx: number; nz: number }, x: number, y: number, z: number) => (y * g.nz + z) * g.nx + x;

export function writeVarint(out: number[], n: number): void {
  let v = n;
  for (;;) {
    const b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) out.push(b | 0x80); else { out.push(b); return; }
  }
}

/** [심볼, 길이, 심볼, 길이...] 평탄 배열 → base64 (테스트·스크립트 역검증용) */
export function encodeRuns(symbols: ArrayLike<number>): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < symbols.length) {
    let j = i;
    while (j < symbols.length && symbols[j] === symbols[i]) j++;
    writeVarint(bytes, symbols[i]);
    writeVarint(bytes, j - i);
    i = j;
  }
  return base64FromBytes(Uint8Array.from(bytes));
}

export function decodeRuns(b64: string, expectedLength: number): Uint16Array {
  const bytes = bytesFromBase64(b64);
  const out = new Uint16Array(expectedLength);
  let pos = 0, at = 0;
  const readVarint = (): number => {
    let n = 0, mul = 1;
    for (;;) {
      if (pos >= bytes.length) throw new Error('RLE 가 중간에 끝남');
      const b = bytes[pos++];
      n += (b & 0x7f) * mul;
      if (!(b & 0x80)) return n;
      mul *= 128;
    }
  };
  while (pos < bytes.length) {
    const sym = readVarint();
    const len = readVarint();
    if (at + len > expectedLength) throw new Error('RLE 길이가 격자보다 김');
    out.fill(sym, at, at + len);
    at += len;
  }
  if (at !== expectedLength) throw new Error(`RLE 길이 불일치: ${at} != ${expectedLength}`);
  return out;
}

export function decodeVoxels(file: VoxelFile): VoxelGrid {
  const [nx, ny, nz] = file.size;
  const sym = decodeRuns(file.rle, nx * ny * nz);
  const part = new Uint8Array(sym.length);
  const color = new Uint8Array(sym.length);
  for (let i = 0; i < sym.length; i++) {
    part[i] = sym[i] >> SYMBOL_PART_SHIFT;
    color[i] = sym[i] & SYMBOL_COLOR_MASK;
  }
  return { nx, ny, nz, part, color };
}

/** 팔레트 'rrggbb' → 0..1 RGB */
export function paletteRgb(hex: string): V3 {
  const n = parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function base64FromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function bytesFromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
