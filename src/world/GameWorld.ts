import * as THREE from 'three';
import { addStaticBox, RAPIER } from '../core/physics';
import type { Conductor } from '../core/types';
import { MAP, type BlockDef, type BlockKind } from '../data/map';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COL, CUES } from '../render/palette';
import { createMaterial } from '../render/materials';
import { createBoxGeometryWithUV } from '../render/boxGeometry';
import { floorTexture, metalTexture, skyTexture, waterTexture, wallTexture } from '../render/textures';
import { lowpolyBox } from '../render/tint';
import { DaySky } from '../render/daySky';
import { isPS1 } from '../render/style';
import { buildDecor } from './buildDecor';
import { VISUAL } from '../config/settings';
import { TUNING } from '../config/tuning';
import { gridNodes, inRect, lineNodes, stairBlocks } from './mapGen';

const FLASH_TIME = 0.3;
const FLASH_COLOR = new THREE.Color(0xe8fffc);
const WATER_Y = 0.06;

/** 감전 시 구조물/물이 번쩍이는 효과 (T6 코일 연쇄 시각화용) */
class Flasher {
  private t = 0;
  constructor(private mats: THREE.MeshLambertMaterial[], private base: THREE.Color) {}
  flash() { this.t = FLASH_TIME; }
  update(dt: number) {
    if (this.t <= 0) return;
    this.t = Math.max(0, this.t - dt);
    for (const m of this.mats) m.emissive.lerpColors(this.base, FLASH_COLOR, this.t / FLASH_TIME);
  }
}

/** 구조물/물 한 조각의 전도체 노드. shock 은 소유 조각을 번쩍이게 한다 */
class ConductorNode implements Conductor {
  readonly position: THREE.Vector3;
  readonly conducts = true;
  readonly radius = TUNING.coil.chainRadius;
  /** 마지막으로 받은 피해 (디버그/테스트) */
  lastShock = 0;
  constructor(pos: [number, number, number], readonly kind: 'metal_structure' | 'water', private flasher: Flasher) {
    this.position = new THREE.Vector3(...pos);
  }
  shock(damage: number) { this.lastShock = damage; this.flasher.flash(); }
}

/** 맵 데이터(data/map.ts)로 지형·충돌·전도체를 만든다 */
export class GameWorld {
  /** 맵 밖 평원의 윗면 높이와 한 변 길이 (시각 전용) */
  private static readonly PLAIN_Y = -0.4;
  private static readonly PLAIN_SIZE = 700; // 중심에서 가장자리까지
  readonly conductors: Conductor[] = [];
  readonly spawn = new THREE.Vector3(...MAP.spawn);
  readonly mobSpawns = MAP.mobSpawns;
  private flashers: Flasher[] = [];
  private tmpDim = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k);
  /** 'lowpoly' 낮 하늘 (ps1 에서는 null) */
  private daySky: DaySky | null = null;
  /** 같은 재질을 쓰는 정적 박스는 하나의 메시로 합친다 ('lowpoly' 전용, 드로우콜 절감) */
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private concreteMat: THREE.Material | null = null;

  constructor(private scene: THREE.Scene, private physics: RAPIER.World) {
    this.buildGround();
    this.buildSky();
    this.buildBlocks();
    this.buildStairs();
    this.buildWater();
    this.flushBatches();
    if (!isPS1) buildDecor(scene, GameWorld.PLAIN_Y);
  }

  /** 카메라를 따라가는 하늘(돔·해·구름) 갱신. 렌더 직전 매 프레임 호출 */
  updateSky(cam: THREE.Camera, dt: number) {
    this.daySky?.update(cam, dt);
  }

  /** 수평 좌표가 물웅덩이 안인가 (T6 누전 판정) */
  isInWater(x: number, z: number) {
    return MAP.water.some((w) => inRect(x, z, w.center, w.size));
  }

  update(dt: number) {
    for (const f of this.flashers) f.update(dt);
  }

  /**
   * 박스 하나 (충돌 + 비주얼). 'lowpoly' 는 정점색 박스를 segment(m) 단위로 분할하고, batch 면 같은 재질끼리 합쳐 flushBatches 에서 한 번에 그린다.
   * 'ps1' 은 기존대로 UV 타일 박스를 개별 메시로 둔다.
   */
  private box(pos: [number, number, number], size: [number, number, number], mat: THREE.Material, collide = true, visual = true, segment: number = VISUAL.lowpoly.tint.segment) {
    if (collide) addStaticBox(this.physics, pos, size);
    if (!visual) return null;
    if (isPS1) {
      const m = new THREE.Mesh(createBoxGeometryWithUV(...size), mat);
      m.position.set(...pos);
      this.scene.add(m);
      return m;
    }
    const geo = lowpolyBox(pos, size, segment);
    const list = this.batches.get(mat);
    if (list) { list.push(geo); return null; }
    this.scene.add(new THREE.Mesh(geo, mat));
    return null;
  }

  /** 재질을 배치 대상으로 등록 (이후 box() 의 지오메트리가 이 재질로 모인다) */
  private batched(mat: THREE.Material) {
    if (!isPS1 && !this.batches.has(mat)) this.batches.set(mat, []);
    return mat;
  }

  private flushBatches() {
    for (const [mat, list] of this.batches) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (merged) this.scene.add(new THREE.Mesh(merged, mat));
      for (const g of list) g.dispose();
    }
    this.batches.clear();
  }

  private buildGround() {
    const S = MAP.size, H = MAP.wallHeight;
    const floorMat = this.batched(isPS1
      ? createMaterial(0xffffff, { map: floorTexture() })
      : createMaterial(COL.sand, { vertexColors: true }));
    const T0 = VISUAL.lowpoly.tint;
    for (const g of MAP.ground) this.box(g.pos, g.size, floorMat, true, true, T0.groundSegment);
    // 맵 밖 평원: 보이기만 한다 (안개가 지평선을 지운다). 협곡을 덮지 않게 맵 바깥 띠 4개로 깔고, 지면보다 살짝 낮춘다
    const e = S / 2 + MAP.groundMargin, P = GameWorld.PLAIN_SIZE, T = MAP.groundThickness, py = GameWorld.PLAIN_Y - T / 2;
    const strip = (cx: number, cz: number, sx: number, sz: number) => this.box([cx, py, cz], [sx, T, sz], floorMat, false, true, T0.farSegment);
    strip(0, -(e + P) / 2, P * 2, P - e); strip(0, (e + P) / 2, P * 2, P - e);
    strip(-(e + P) / 2, 0, P - e, e * 2); strip((e + P) / 2, 0, P - e, e * 2);
    // 외곽 충돌 벽 (렌더 안 함: 원경 랜드마크가 가려지지 않게)
    const hs = S / 2 + 0.5;
    const wall = floorMat;
    this.box([0, H / 2, -hs], [S + 2, H, 1], wall, true, false);
    this.box([0, H / 2, hs], [S + 2, H, 1], wall, true, false);
    this.box([-hs, H / 2, 0], [1, H, S], wall, true, false);
    this.box([hs, H / 2, 0], [1, H, S], wall, true, false);
  }

  /**
   * 하늘 + 원경 랜드마크. 'ps1': 노을 돔+별+달, 랜드마크는 안개 무시 발광 실루엣(밑동 탈색).
   * 'lowpoly': 낮 하늘 돔+해+구름, 랜드마크는 안개 원근을 받는 일반 재질(밑동 띠는 탈색 파라미터 데모).
   */
  private buildSky() {
    if (isPS1) return this.buildSkyPS1();
    this.daySky = new DaySky(this.scene);
    const seg = 25, desat = VISUAL.lowpoly.desat.landmarkBase;
    for (const l of MAP.landmarks) {
      this.box(l.pos, l.size, createMaterial(l.lowColor, { vertexColors: true }), false, true, seg);
      if (l.band) {
        const bs: [number, number, number] = [l.size[0] + 0.6, l.band.height, l.size[2] + 0.6];
        this.box([l.pos[0], l.pos[1] - l.size[1] / 2 + l.band.height / 2, l.pos[2]], bs,
          createMaterial(l.band.lowColor, { vertexColors: true, desaturate: desat }), false, true, seg);
      }
    }
  }

  private buildSkyPS1() {
    // 하늘 돔: 절차 그라디언트(위 남보라 → 지평선 호박)+별+구름. 안개·깊이 무시, 카메라를 따라다니며 항상 맨 뒤에 그린다
    const sd = VISUAL.lighting.sunDir;
    const sunAz = Math.atan2(sd[2], -sd[0]); // SphereGeometry 의 u(방위) 규약: 방향 (x,z) = (-cos φ, sin φ)
    const skyMat = createMaterial(0x000000, { emissive: 0xffffff, emissiveMap: skyTexture(sunAz, VISUAL.fog.color), fog: false });
    skyMat.side = THREE.BackSide;
    skyMat.depthTest = false;
    skyMat.depthWrite = false;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(VISUAL.sky.radius, 32, 16), skyMat);
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    dome.onBeforeRender = (_r, _s, cam) => dome.position.copy(cam.position);
    this.scene.add(dome);
    const flat = (color: number) => createMaterial(0x000000, { emissive: color, fog: false });
    for (const l of MAP.landmarks) {
      this.box(l.pos, l.size, flat(l.color), false);
      if (l.band) {
        const bs: [number, number, number] = [l.size[0] + 0.6, l.band.height, l.size[2] + 0.6];
        this.box([l.pos[0], l.pos[1] - l.size[1] / 2 + l.band.height / 2, l.pos[2]], bs, flat(l.band.color), false);
      }
    }
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(MAP.moon.radius, 1), flat(MAP.moon.color));
    moon.position.set(...MAP.moon.pos);
    this.scene.add(moon);
  }

  /** 종류별 재질. 금속은 구조물마다 따로 만들어 개별로 번쩍이게 한다 */
  private blockMaterial(kind: BlockKind) {
    if (kind === 'concrete') {
      this.concreteMat ??= this.batched(isPS1
        ? createMaterial(0xffffff, { map: wallTexture(false) })
        : createMaterial(COL.stone, { vertexColors: true }));
      return { mat: this.concreteMat, flasher: null };
    }
    const emissive = this.tmpDim(CUES.conductor, isPS1 ? 0.28 : VISUAL.lowpoly.conductorGlow);
    const mat = isPS1
      ? createMaterial(0xffffff, { map: metalTexture(), emissive: emissive.getHex() })
      : createMaterial(COL.copper, { vertexColors: true, emissive: emissive.getHex() });
    const flasher = new Flasher([mat], emissive);
    this.flashers.push(flasher);
    return { mat, flasher };
  }

  private buildBlocks() {
    const place = (b: { pos: [number, number, number]; size: [number, number, number]; kind: BlockKind }) => {
      const { mat, flasher } = this.blockMaterial(b.kind);
      this.box(b.pos, b.size, mat);
      if (flasher) {
        for (const n of lineNodes(b.pos, b.size, TUNING.coil.chainRadius * 0.7)) {
          this.conductors.push(new ConductorNode(n, 'metal_structure', flasher));
        }
      }
    };
    for (const b of MAP.blocks as BlockDef[]) place(b);
  }

  private buildStairs() {
    for (const s of MAP.stairs) {
      const { mat, flasher } = this.blockMaterial(s.kind);
      stairBlocks(s).forEach((p, i) => {
        this.box(p.pos, p.size, mat);
        // 금속 계단은 3단마다 노드 (간격 ≤ 연쇄 반경)
        if (flasher && i % 3 === 0) this.conductors.push(new ConductorNode(p.pos, 'metal_structure', flasher));
      });
    }
  }

  private buildWater() {
    for (const w of MAP.water) {
      const emissive = this.tmpDim(CUES.conductor, 0.3);
      const mat = isPS1
        ? createMaterial(0xffffff, { map: waterTexture(), emissive: emissive.getHex() })
        : createMaterial(COL.verdigris, { vertexColors: true, emissive: emissive.getHex() });
      const flasher = new Flasher([mat], emissive);
      this.flashers.push(flasher);
      this.box([w.center[0], WATER_Y / 2, w.center[1]], [w.size[0], WATER_Y, w.size[1]], mat, false);
      for (const n of gridNodes(w.center, w.size, TUNING.coil.chainRadius * 0.7, WATER_Y + 0.05)) {
        this.conductors.push(new ConductorNode(n, 'water', flasher));
      }
    }
  }
}
