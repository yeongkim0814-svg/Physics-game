/** 장식 배치용 순수 계산 (시각 전용). 결정적 난수로 점을 흩뿌리고, 막힌 곳은 거른다 */
export function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScatterPoint { x: number; z: number; /** 0~1 난수 3개 (크기·색·회전용) */ r: [number, number, number] }

/**
 * 맵 중심 기준 체비셰프 거리 [minDist, maxDist] 의 정사각 고리 안에 count 개의 점을 흩뿌린다. reject 가 true 인 점은 버린다.
 * 시도 횟수 상한(count×20)이 있어 막힌 곳이 많으면 count 보다 적게 반환할 수 있다.
 */
export function scatter(
  seed: number, count: number, range: readonly [number, number], reject: (x: number, z: number) => boolean = () => false,
): ScatterPoint[] {
  const rnd = mulberry(seed), out: ScatterPoint[] = [];
  const max = range[1];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const x = (rnd() * 2 - 1) * max, z = (rnd() * 2 - 1) * max;
    const d = Math.max(Math.abs(x), Math.abs(z));
    const r: [number, number, number] = [rnd(), rnd(), rnd()];
    if (d < range[0] || d > max || reject(x, z)) continue;
    out.push({ x, z, r });
  }
  return out;
}

/** 중심 c, 전체 크기 s 의 직사각형(수평)을 margin 만큼 키워 (x,z) 가 안에 들어가는가 */
export function inFootprint(x: number, z: number, c: readonly [number, number], s: readonly [number, number], margin: number) {
  return Math.abs(x - c[0]) <= s[0] / 2 + margin && Math.abs(z - c[1]) <= s[1] / 2 + margin;
}
