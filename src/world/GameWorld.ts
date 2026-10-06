import * as THREE from 'three';
import { addStaticBox, RAPIER } from '../core/physics';
import type { Conductor } from '../core/types';
import { MAP, type BlockDef, type BlockKind } from '../data/map';
import { CUES, lambert } from '../render/palette';
import { createBoxGeometryWithUV } from '../render/boxGeometry';
import { floorTexture, metalTexture, waterTexture, wallTexture } from '../render/textures';
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

  constructor(private scene: THREE.Scene, private physics: RAPIER.World) {
    this.buildGround();
    this.buildSky();
    this.buildBlocks();
    this.buildStairs();
    this.buildWater();
  }

  /** 수평 좌표가 물웅덩이 안인가 (T6 누전 판정) */
  isInWater(x: number, z: number) {
    return MAP.water.some((w) => inRect(x, z, w.center, w.size));
  }

  update(dt: number) {
    for (const f of this.flashers) f.update(dt);
  }

  private box(pos: [number, number, number], size: [number, number, number], mat: THREE.Material, collide = true, visual = true) {
    if (collide) addStaticBox(this.physics, pos, size);
    if (!visual) return null;
    const m = new THREE.Mesh(createBoxGeometryWithUV(...size), mat);
    m.position.set(...pos);
    this.scene.add(m);
    return m;
  }

  private buildGround() {
    const S = MAP.size, H = MAP.wallHeight;
    const floorMat = lambert(0xffffff, { map: floorTexture() });
    for (const g of MAP.ground) this.box(g.pos, g.size, floorMat);
    // 맵 밖 평원: 보이기만 한다 (안개가 지평선을 지운다). 협곡을 덮지 않게 맵 바깥 띠 4개로 깔고, 지면보다 살짝 낮춘다
    const e = S / 2 + MAP.groundMargin, P = GameWorld.PLAIN_SIZE, T = MAP.groundThickness, py = GameWorld.PLAIN_Y - T / 2;
    const strip = (cx: number, cz: number, sx: number, sz: number) => this.box([cx, py, cz], [sx, T, sz], floorMat, false);
    strip(0, -(e + P) / 2, P * 2, P - e); strip(0, (e + P) / 2, P * 2, P - e);
    strip(-(e + P) / 2, 0, P - e, e * 2); strip((e + P) / 2, 0, P - e, e * 2);
    // 외곽 충돌 벽 (렌더 안 함: 원경 랜드마크가 가려지지 않게)
    const hs = S / 2 + 0.5;
    const wall = lambert(0xffffff);
    this.box([0, H / 2, -hs], [S + 2, H, 1], wall, true, false);
    this.box([0, H / 2, hs], [S + 2, H, 1], wall, true, false);
    this.box([-hs, H / 2, 0], [1, H, S], wall, true, false);
    this.box([hs, H / 2, 0], [1, H, S], wall, true, false);
  }

  /** 안개 너머 랜드마크 실루엣(밑동 탈색) + 달. 안개를 무시하고 평평한 색(발광만)으로 그린다 */
  private buildSky() {
    const flat = (color: number) => lambert(0x000000, { emissive: color, fog: false });
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
    if (kind === 'concrete') return { mat: lambert(0xffffff, { map: wallTexture(false) }), flasher: null };
    const emissive = this.tmpDim(CUES.conductor, 0.28);
    const mat = lambert(0xffffff, { map: metalTexture(), emissive: emissive.getHex() });
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
      const mat = lambert(0xffffff, { map: waterTexture(), emissive: emissive.getHex() });
      const flasher = new Flasher([mat], emissive);
      this.flashers.push(flasher);
      this.box([w.center[0], WATER_Y / 2, w.center[1]], [w.size[0], WATER_Y, w.size[1]], mat, false);
      for (const n of gridNodes(w.center, w.size, TUNING.coil.chainRadius * 0.7, WATER_Y + 0.05)) {
        this.conductors.push(new ConductorNode(n, 'water', flasher));
      }
    }
  }
}
