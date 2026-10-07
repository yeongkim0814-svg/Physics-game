import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import {
  BELT_Y, BOOT_FOOT, BOOT_SHAFT, BOOT_SOLE, FACE_VOID, GAP_DEG, GLOVE, HOOD, HOOD_HOLE, HOOD_OPTS, HOOD_RIM_RADIUS, PACK, PACK_TUBE,
  ROBE_UPPER, ROBE_UPPER_OPTS, SCOL, SHIN_RINGS, SKIRT, SKIRT_ARCS, SKIRT_FRONT_SCALE, SKIRT_OPTS, SLEEVE_FORE, SLEEVE_OPTS, SLEEVE_UPPER,
  THIGH_RINGS, TUNIC_INSET,
} from '../data/scientist';
import {
  ellipsoidRings, linePath, mergeAll, mirrorX, placed, rad, ribbon, RingSurface, roundBoxRings, tubeLoop, type SRing, type V3,
} from './smoothMesh';

/**
 * 후드 로브 과학자 지오메트리 (순수 THREE — canvas 없이 테스트 가능). 관절 그룹마다 하나로 병합한다(전부 한 재질: 천 텍스처 × 정점색).
 * 곡면은 smoothMesh.RingSurface(스무스 법선), 끈·줄무늬·문양은 같은 표면 위에 얹는 띠(ribbon). 사양은 data/scientist.ts.
 */
export type GroupGeo = THREE.BufferGeometry | undefined;
export interface ScientistGeometry {
  torso: GroupGeo; head: GroupGeo; skirtF: GroupGeo; skirtB: GroupGeo;
  thigh: { R: GroupGeo; L: GroupGeo }; shin: { R: GroupGeo; L: GroupGeo };
  upperArm: { R: GroupGeo; L: GroupGeo }; forearm: { R: GroupGeo; L: GroupGeo };
  /** 전체 삼각형 수 (공유 지오메트리는 사용 횟수만큼 센다) */
  triangles: number;
}

const D = VISUAL.scientist.detail;
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** 같은 반경에서 inset 만큼 줄인 링 (로브 속 검은 옷) */
const inset = (rings: readonly SRing[], d: number, c: number): SRing[] => rings.map((r) => ({ ...r, rx: r.rx - d, rz: r.rz - d, c, ao: 1 }));
const scaled = (rings: readonly SRing[], k: number): SRing[] => rings.map((r) => ({ ...r, rx: r.rx * k, rz: r.rz * k }));
/** 하네스 끈 경로 도우미: 반대쪽은 phi 부호 반전 */
const flipPhi = (c: readonly (readonly [number, number])[]) => c.map(([p, y]) => [-p, y] as const);

function buildTorso(exp: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const robe = new RingSurface(ROBE_UPPER, ROBE_UPPER_OPTS);
  const open = [GAP_DEG, 360 - GAP_DEG] as const;
  parts.push(robe.build({ sides: D.robeSides, arc: open, tile: D.tile, exposure: exp }));
  parts.push(new RingSurface(inset(ROBE_UPPER, TUNIC_INSET, SCOL.tunic)).build({ sides: D.limbSides + 2, capTop: true, tile: D.tile, exposure: exp }));

  // 로브 앞 트임 가장자리의 붉은 안감 선
  for (const s of [1, -1]) {
    parts.push(ribbon(robe.path([[s * (GAP_DEG + 1.6), 0.5], [s * (GAP_DEG + 1.6), -0.32]], 10), 0.012, SCOL.red, 0.0035, { exposure: exp }));
  }

  // 하네스: 뒤(배낭)에서 어깨를 넘어 앞가슴으로 내려와 벨트에 닿는 끈 2개 + 대각 가방끈
  const harness: (readonly [number, number])[] = [[158, 0.4], [122, 0.47], [80, 0.45], [52, 0.36], [32, 0.22], [23, 0.07]];
  parts.push(ribbon(robe.path(harness, 4), 0.042, SCOL.strap, 0.006, { exposure: exp }));
  parts.push(ribbon(robe.path(flipPhi(harness), 4), 0.042, SCOL.strap, 0.006, { exposure: exp }));
  const messenger: (readonly [number, number])[] = [[100, 0.46], [62, 0.4], [25, 0.28], [-5, 0.17], [-40, 0.05], [-68, -0.08], [-78, -0.2]];
  parts.push(ribbon(robe.path(messenger, 5), 0.05, SCOL.strapLight, 0.0095, { exposure: exp }));

  // 등 중앙 검은 배너 (배낭 밑에서 아랫자락까지 이어진다) + 붉은 선
  parts.push(ribbon(robe.path([[180, 0.34], [180, -0.32]], 10), 0.17, SCOL.tunic, 0.006, { exposure: exp }));
  parts.push(ribbon(robe.path([[180, 0.09], [180, -0.32]], 10), 0.012, SCOL.red, 0.0095, { exposure: exp }));

  // 벨트: 로브 바깥을 두른 띠 + 버클
  const [b0, b1] = BELT_Y, bx = 0.014;
  const belt: SRing[] = [
    { y: b0, rx: 0.236 + bx - 0.003, rz: 0.172 + bx - 0.003, c: SCOL.belt, ao: 0.8 },
    { y: b0 + 0.011, rx: 0.236 + bx, rz: 0.172 + bx, c: SCOL.belt, ao: 0.95 },
    { y: b1 - 0.011, rx: 0.242 + bx, rz: 0.172 + bx, c: SCOL.belt, ao: 1 },
    { y: b1, rx: 0.242 + bx - 0.003, rz: 0.172 + bx - 0.003, c: SCOL.belt, ao: 0.95 },
  ];
  parts.push(new RingSurface(belt, { n: 2.4 }).build({ sides: 40, tile: D.tile, exposure: exp }));
  const mid = (b0 + b1) / 2;
  parts.push(placed(new RingSurface(roundBoxRings(0.052, 0.046, 0.016, SCOL.metal, { round: 0.008, ao: [0.8, 1] }), { n: 4 })
    .build({ sides: 12, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), T(0, mid, -(0.172 + bx + 0.006))));

  // 벨트 파우치: 허리 둘레 phi 위치에 바깥을 향해 붙인다
  const pouch = (phiDeg: number, y: number, [w, h, d]: V3, lid: boolean) => {
    const phi = rad(phiDeg), off = d / 2 - 0.004;
    const px = (0.236 + bx) * Math.sin(phi) + off * Math.sin(phi), pz = -(0.172 + bx) * Math.cos(phi) - off * Math.cos(phi);
    const m = T(px, y, pz).multiply(new THREE.Matrix4().makeRotationY(-phi));
    parts.push(placed(new RingSurface(roundBoxRings(w, h, d, SCOL.pouch, { round: 0.014, ao: [0.75, 1] }), { n: 4 })
      .build({ sides: 14, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), m.clone()));
    if (lid) {
      parts.push(placed(new RingSurface(roundBoxRings(w + 0.006, 0.04, d + 0.006, SCOL.pouchLid, { round: 0.012, ao: [0.85, 1] }), { n: 4 })
        .build({ sides: 14, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), T(0, h / 2 - 0.012, 0).premultiply(m)));
    }
  };
  pouch(-78, -0.075, [0.065, 0.14, 0.095], true);
  pouch(72, -0.055, [0.065, 0.11, 0.09], true);
  pouch(-36, -0.04, [0.055, 0.085, 0.065], true);
  pouch(128, -0.04, [0.065, 0.085, 0.065], true);

  // 배낭 + 시료관 + 문양
  const [pcx, pcy, pcz] = PACK.center, [pw, ph, pd] = PACK.size;
  parts.push(placed(new RingSurface(roundBoxRings(pw, ph, pd, SCOL.pack, { round: PACK.round, ao: [0.8, 1] }), { n: 4 })
    .build({ sides: 24, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), T(pcx, pcy, pcz)));
  const tubeRings: SRing[] = [
    { y: PACK_TUBE.y0, rx: 0.02, rz: 0.02, c: SCOL.metal, ao: 0.8 },
    { y: PACK_TUBE.y0 + 0.012, rx: 0.031, rz: 0.031, c: SCOL.metal, ao: 0.9 },
    { y: PACK_TUBE.y0 + 0.015, rx: PACK_TUBE.r, rz: PACK_TUBE.r, c: SCOL.glass, ao: 0.95 },
    { y: PACK_TUBE.y1 - 0.015, rx: PACK_TUBE.r, rz: PACK_TUBE.r, c: SCOL.glass, ao: 1 },
    { y: PACK_TUBE.y1 - 0.012, rx: 0.031, rz: 0.031, c: SCOL.metal, ao: 1 },
    { y: PACK_TUBE.y1, rx: 0.02, rz: 0.02, c: SCOL.metal, ao: 1 },
  ];
  for (const s of [1, -1]) {
    parts.push(placed(new RingSurface(tubeRings).build({ sides: 12, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), T(s * PACK_TUBE.x, 0, PACK_TUBE.z)));
  }
  const backZ = pcz + pd / 2 + 0.004, n: V3 = [0, 0, 1];
  const tri: V3[] = [[0, pcy + 0.075, backZ], [-0.052, pcy - 0.02, backZ], [0.052, pcy - 0.02, backZ]];
  for (let i = 0; i < 3; i++) parts.push(ribbon(linePath(tri[i], tri[(i + 1) % 3], n, 3), 0.008, SCOL.emblem, 0.0015, { exposure: exp }));
  parts.push(ribbon(linePath([0, pcy + 0.01, backZ], [0, pcy - 0.02, backZ], n, 2), 0.008, SCOL.emblem, 0.0015, { exposure: exp }));
  return mergeAll(parts)!;
}

function buildHead(exp: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hole = { phiMax: rad(HOOD_HOLE.phiMaxDeg), yc: HOOD_HOLE.yc, hy: HOOD_HOLE.hy };
  const hood = new RingSurface(HOOD, { ...HOOD_OPTS, hole });
  parts.push(hood.build({ sides: 36, start: 180, capTop: true, tile: D.tile, exposure: exp }));
  // 열린 가장자리의 말린 테두리
  const rim = Array.from({ length: 28 }, (_, i) => {
    const th = (Math.PI * 2 * i) / 28;
    const f = hood.frame(hole.phiMax * Math.cos(th), hood.kAtY(hole.yc + hole.hy * Math.sin(th)));
    return f;
  });
  parts.push(tubeLoop(rim, HOOD_RIM_RADIUS, SCOL.hoodRim, { exposure: exp, sides: 6 }));
  // 후드 속 검은 얼굴
  const f = FACE_VOID;
  parts.push(new RingSurface(ellipsoidRings(f.cy, f.rx, f.ry, f.rz, SCOL.voidFace, { cz: f.cz, lat: 6, ao: [0.8, 1] }))
    .build({ sides: 16, capTop: true, capBottom: true, tile: D.tile, exposure: exp }));
  return mergeAll(parts)!;
}

function buildSkirts(exp: number): { front: THREE.BufferGeometry; back: THREE.BufferGeometry } {
  const front: THREE.BufferGeometry[] = [], back: THREE.BufferGeometry[] = [];
  const fs = new RingSurface(scaled(SKIRT, SKIRT_FRONT_SCALE), SKIRT_OPTS);
  const opts = (arc: readonly [number, number]) => ({ sides: D.robeSides, arc, tile: D.tile, exposure: exp });
  front.push(fs.build(opts(SKIRT_ARCS.frontR)), fs.build(opts(SKIRT_ARCS.frontL)));
  for (const s of [1, -1]) front.push(ribbon(fs.path([[s * (GAP_DEG + 1.6), 0], [s * (GAP_DEG + 1.6), -0.52]], 8), 0.012, SCOL.red, 0.0035, { exposure: exp }));

  const bs = new RingSurface(SKIRT, SKIRT_OPTS);
  back.push(bs.build(opts(SKIRT_ARCS.back)));
  back.push(ribbon(bs.path([[180, 0], [180, -0.52]], 8), 0.17, SCOL.tunic, 0.006, { exposure: exp }));
  back.push(ribbon(bs.path([[180, 0], [180, -0.5]], 8), 0.012, SCOL.red, 0.0095, { exposure: exp }));
  // 배너 문양: 위 꼭짓점 + 아래 두 점의 삼각형
  const tri: (readonly [number, number])[] = [[180, -0.15], [172.4, -0.25], [187.6, -0.25]];
  for (let i = 0; i < 3; i++) {
    back.push(ribbon(bs.path([tri[i], tri[(i + 1) % 3]], 4), 0.008, SCOL.emblem, 0.0125, { exposure: exp }));
  }
  return { front: mergeAll(front)!, back: mergeAll(back)! };
}

function buildArms(exp: number): { upper: THREE.BufferGeometry; fore: THREE.BufferGeometry } {
  const sides = D.limbSides + 4;
  const upperS = new RingSurface(SLEEVE_UPPER, SLEEVE_OPTS);
  const upper = [upperS.build({ sides, capTop: true, capBottom: false, tile: D.tile, exposure: exp })];
  // 소매 띠(붉은 줄)와 연구소 문양: 바깥쪽(+x) 면
  upper.push(ribbon(upperS.path([[55, -0.1], [125, -0.1]], 8), 0.026, SCOL.red, 0.004, { exposure: exp }));
  const tri: (readonly [number, number])[] = [[90, -0.14], [79, -0.22], [101, -0.22]];
  for (let i = 0; i < 3; i++) upper.push(ribbon(upperS.path([tri[i], tri[(i + 1) % 3]], 4), 0.007, SCOL.red, 0.004, { exposure: exp }));

  const fore = [
    new RingSurface(SLEEVE_FORE, SLEEVE_OPTS).build({ sides, capBottom: false, capTop: true, capColor: SCOL.tunic, tile: D.tile, exposure: exp }),
    new RingSurface(GLOVE, { smooth: 2 }).build({ sides: 16, capTop: true, capBottom: true, tile: D.tile, exposure: exp }),
  ];
  return { upper: mergeAll(upper)!, fore: mergeAll(fore)! };
}

function buildLeg(exp: number): { thigh: THREE.BufferGeometry; shin: THREE.BufferGeometry } {
  const s = D.limbSides;
  const thigh = new RingSurface(THIGH_RINGS).build({ sides: 14, capTop: true, capBottom: true, tile: D.tile, exposure: exp });
  const foot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const shin = [
    new RingSurface(SHIN_RINGS).build({ sides: 14, capTop: true, capBottom: true, tile: D.tile, exposure: exp }),
    new RingSurface(BOOT_SHAFT, { smooth: 2 }).build({ sides: s, capTop: true, capBottom: true, tile: D.tile, exposure: exp }),
    placed(new RingSurface(BOOT_FOOT, { smooth: 2, n: 2.6 }).build({ sides: s, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), foot.clone()),
    placed(new RingSurface(BOOT_SOLE, { smooth: 2, n: 3 }).build({ sides: s, capTop: true, capBottom: true, tile: D.tile, exposure: exp }), foot.clone()),
  ];
  return { thigh, shin: mergeAll(shin)! };
}

const triCount = (g: GroupGeo) => (g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0);

/** 모든 관절 그룹의 지오메트리. exposure = 알베도 배율 (시간대 프리셋 character.exposure) */
export function buildScientistGeometry(exposure: number): ScientistGeometry {
  const torso = buildTorso(exposure);
  const head = buildHead(exposure);
  const sk = buildSkirts(exposure);
  const arms = buildArms(exposure);
  const leg = buildLeg(exposure);
  const upperArm = { R: arms.upper, L: mirrorX(arms.upper) };
  const forearm = { R: arms.fore, L: mirrorX(arms.fore) };
  const thigh = { R: leg.thigh, L: leg.thigh }; // 좌우 대칭이라 지오메트리를 공유한다
  const shin = { R: leg.shin, L: leg.shin };
  const all = [torso, head, sk.front, sk.back, thigh.R, thigh.L, shin.R, shin.L, upperArm.R, upperArm.L, forearm.R, forearm.L];
  return { torso, head, skirtF: sk.front, skirtB: sk.back, thigh, shin, upperArm, forearm, triangles: all.reduce((n, g) => n + triCount(g), 0) };
}
