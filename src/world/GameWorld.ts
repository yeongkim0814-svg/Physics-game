import * as THREE from 'three';
import { addStaticBox, addStaticTrimesh, RAPIER } from '../core/physics';
import type { Conductor } from '../core/types';
import { MAP, TERRAIN_DATA, type BlockDef, type BlockKind } from '../data/map';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COL, CUES } from '../render/palette';
import { createMaterial } from '../render/materials';
import { lowpolyBox } from '../render/tint';
import { DaySky } from '../render/daySky';
import { LP } from '../render/style';
import { Backdrop } from '../render/backdrop';
import { buildBlockMesh, type BoxSpec, type FaceKey, type MeshData, type PaletteKey, type TerrainLook } from './blockTerrain';
import { Atmosphere } from './atmosphere';
import { buildDecor } from './buildDecor';
import { buildTechModules } from './techModules';
import { pulseScale } from '../render/texKit';
import { VISUAL } from '../config/settings';
import { TUNING } from '../config/tuning';
import { gridNodes, inRect, lineNodes, stairBlocks } from './mapGen';
import { TERRAIN_COLLISION, TERRAIN_FIELD, TERRAIN_MESH } from '../config/terrainParams';
import { createTerrainField, type TerrainField } from './terrain/terrainField';
import { buildCollisionMesh, buildTerrainMesh } from './terrain/terrainMesh';

const FLASH_TIME = 0.3;
const FLASH_COLOR = new THREE.Color(0xe8fffc);
const WATER_Y = 0.06;

/** 감전 시 구조물/물이 번쩍이는 효과 (T6 코일 연쇄 시각화용) */
class Flasher {
  private t = 0;
  private clock = 0;
  constructor(private mats: THREE.MeshLambertMaterial[], private base: THREE.Color) {}
  flash() { this.t = FLASH_TIME; }
  update(dt: number) {
    this.clock += dt;
    if (this.t > 0) {
      this.t = Math.max(0, this.t - dt);
      for (const m of this.mats) m.emissive.lerpColors(this.base, FLASH_COLOR, this.t / FLASH_TIME);
      return;
    }
    // 평상시: 전도체 단서는 맥동한다 (G9: 장식 청록은 정적이라 이것으로 구분)
    const P = VISUAL.lowpoly.tech.conductorPulse, k = pulseScale(this.clock, P.amp, P.rate);
    for (const m of this.mats) m.emissive.copy(this.base).multiplyScalar(k);
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
  readonly conductors: Conductor[] = [];
  readonly spawn = new THREE.Vector3(...MAP.spawn);
  readonly mobSpawns = MAP.mobSpawns;
  private flashers: Flasher[] = [];
  private tmpDim = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k);
  private daySky: DaySky | null = null;
  /** 황혼 원경 백드롭·분위기 소품 (빛기둥·창문·파편·안개 면) */
  private backdrop: Backdrop | null = null;
  private atmosphere: Atmosphere | null = null;
  /** 블록 지형: 정점색 모자이크 메시용 박스 목록 (하나의 드로우콜로 합친다) */
  private terrainSpecs: BoxSpec[] = [];
  private terrainMat: THREE.Material | null = null;
  /** 하이트필드 지형 (A2) */
  terrainField: TerrainField | null = null;
  /** 지형 생성 통계 (로딩 지연·삼각형 수 보고용) */
  terrainStats = { fieldMs: 0, meshMs: 0, collisionMs: 0, renderTris: 0, collisionTris: 0, collisionVerts: 0 };
  /** 같은 재질을 쓰는 정적 박스는 하나의 메시로 합친다 (드로우콜 절감) */
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private concreteMat: THREE.Material | null = null;

  constructor(private scene: THREE.Scene, private physics: RAPIER.World) {
    this.buildGround();
    this.buildSky();
    this.buildBlocks();
    this.buildStairs();
    this.buildWater();
    this.buildTerrainExtras();
    this.flushBatches();
    this.flushTerrain();
    buildDecor(scene, this.terrainField!);
    buildTechModules(scene, this.terrainField!);
    if (this.backdrop || LP.features.beam || LP.features.debris || LP.features.windows) this.atmosphere = new Atmosphere(scene);
  }

  /** 카메라를 따라가는 하늘(돔·해·구름)·백드롭 갱신, 분위기 소품 애니메이션. 렌더 직전 매 프레임 호출 */
  updateSky(cam: THREE.Camera, dt: number) {
    this.daySky?.update(cam, dt);
    this.backdrop?.update(cam);
    this.atmosphere?.update(dt);
  }

  /** 지형 박스를 모자이크 빌더 목록에 추가 */
  private terrain(pos: [number, number, number], size: [number, number, number], palette: PaletteKey, tile: number, faces?: Partial<Record<FaceKey, boolean>>, mossScale?: number) {
    this.terrainSpecs.push({ pos, size, palette, tile, faces, mossScale });
  }

  private flushTerrain() {
    const T = VISUAL.lowpoly.terrain;
    const parts: MeshData[] = [];
    if (this.terrainSpecs.length) parts.push(buildBlockMesh(this.terrainSpecs, LP.terrain as TerrainLook, T.maxTilesPerAxis, T.seed, T.facet));
    if (this.terrainField) {
      const t0 = performance.now();
      const hf = buildTerrainMesh(this.terrainField, LP.terrain as TerrainLook, { depth: LP.terrain.depthTint, wall: LP.terrain.depthTint.wall, far: LP.terrain.farTint }, { ...TERRAIN_MESH, topPalette: TERRAIN_MESH.topPalette, facet: T.facet, walkHalf: TERRAIN_COLLISION.half + 2 });
      this.terrainStats.meshMs = performance.now() - t0;
      this.terrainStats.renderTris = hf.positions.length / 9;
      parts.push(hf);
    }
    this.terrainSpecs = [];
    if (!parts.length) return;
    const cat = (key: keyof MeshData) => {
      const out = new Float32Array(parts.reduce((n, p) => n + p[key].length, 0));
      let o = 0;
      for (const p of parts) { out.set(p[key], o); o += p[key].length; }
      return out;
    };
    // 블록 모자이크(폐허·계단·테라스·돌출)와 하이트필드는 같은 재질이라 하나의 메시(1 드로우콜)로 합친다
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cat('positions'), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(cat('normals'), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cat('colors'), 3));
    const mesh = new THREE.Mesh(geo, this.terrainMat ?? (this.terrainMat = createMaterial(0xffffff, { vertexColors: true, tex: { top: 'grain', side: 'stone', tile: VISUAL.lowpoly.texture.terrainTile, amp: VISUAL.lowpoly.texture.amp } })));
    mesh.frustumCulled = false; // 맵 전체를 덮는 큰 메시 (바운딩 계산 비용 대신)
    this.scene.add(mesh);
  }

  /** 시각 전용 지형 소품: 협곡 벽 돌출 (황혼). 맵 밖 메사는 하이트필드(massifs)가 대신한다 */
  private buildTerrainExtras() {
    if (!LP.features.ledges) return;
    const T = VISUAL.lowpoly.terrain, zc = (MAP.canyon.zMin + MAP.canyon.zMax) / 2;
    for (const l of MAP.ledgeParts) {
      const southWall = l.pos[2] > zc; // 남쪽 벽(z 큰 쪽)에서 북쪽(-z)으로 돌출하면 앞면 = nz
      this.terrain(l.pos, l.size, 'cliff', T.tile.ledge, { py: true, ny: true, px: true, nx: true, nz: southWall, pz: !southWall }, 0.5);
    }
  }

  /** 수평 좌표가 물웅덩이 안인가 (T6 누전 판정) */
  isInWater(x: number, z: number) {
    return MAP.water.some((w) => inRect(x, z, w.center, w.size));
  }

  update(dt: number) {
    for (const f of this.flashers) f.update(dt);
  }

  /** 박스 하나 (충돌 + 비주얼). 정점색 박스를 segment(m) 단위로 분할하고, batch 면 같은 재질끼리 합쳐 flushBatches 에서 한 번에 그린다 */
  private box(pos: [number, number, number], size: [number, number, number], mat: THREE.Material, collide = true, visual = true, segment: number = VISUAL.lowpoly.tint.segment) {
    if (collide) addStaticBox(this.physics, pos, size);
    if (!visual) return null;
    const geo = lowpolyBox(pos, size, segment);
    const list = this.batches.get(mat);
    if (list) { list.push(geo); return null; }
    this.scene.add(new THREE.Mesh(geo, mat));
    return null;
  }

  /** 재질을 배치 대상으로 등록 (이후 box() 의 지오메트리가 이 재질로 모인다) */
  private batched(mat: THREE.Material) {
    if (!this.batches.has(mat)) this.batches.set(mat, []);
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
    const floorMat = this.batched(createMaterial(COL.sand, { vertexColors: true }));
    // 계단형 하이트필드: 고원·협곡·고원 바깥 계곡/메사/산맥. 충돌 = 렌더와 일치하는 정적 trimesh (외곽 벽 안쪽만), 원거리 링은 시각 전용
    const field = createTerrainField(TERRAIN_FIELD, TERRAIN_DATA);
    this.terrainField = field;
    this.terrainStats.fieldMs = field.buildMs;
    const t0 = performance.now();
    const cm = buildCollisionMesh(field, TERRAIN_COLLISION.half);
    addStaticTrimesh(this.physics, cm.vertices, cm.indices);
    this.terrainStats.collisionMs = performance.now() - t0;
    this.terrainStats.collisionTris = cm.indices.length / 3;
    this.terrainStats.collisionVerts = cm.vertices.length / 3;
    // 외곽 충돌 벽 (렌더 안 함: 원경 랜드마크가 가려지지 않게)
    const hs = S / 2 + 0.5;
    const wall = floorMat;
    this.box([0, H / 2, -hs], [S + 2, H, 1], wall, true, false);
    this.box([0, H / 2, hs], [S + 2, H, 1], wall, true, false);
    this.box([-hs, H / 2, 0], [1, H, S], wall, true, false);
    this.box([hs, H / 2, 0], [1, H, S], wall, true, false);
  }

  /** 하늘 돔·해·구름 + 원경 백드롭. 원경 산맥은 하이트필드가 맡는다 */
  private buildSky() {
    this.daySky = new DaySky(this.scene);
    if (LP.features.backdrop) this.backdrop = new Backdrop(this.scene);
  }

  /** 종류별 재질. 금속은 구조물마다 따로 만들어 개별로 번쩍이게 한다 */
  private blockMaterial(kind: BlockKind) {
    if (kind === 'concrete') {
      this.concreteMat ??= this.batched(createMaterial(COL.stone, { vertexColors: true }));
      return { mat: this.concreteMat, flasher: null };
    }
    const emissive = this.tmpDim(CUES.conductor, VISUAL.lowpoly.conductorGlow);
    const X = VISUAL.lowpoly.texture;
    const mat = createMaterial(COL.copper, { vertexColors: true, emissive: emissive.getHex(), tex: { top: 'metal', side: 'metal', tile: X.metalTile, amp: X.amp } });
    const flasher = new Flasher([mat], emissive);
    this.flashers.push(flasher);
    return { mat, flasher };
  }

  private buildBlocks() {
    const TT = VISUAL.lowpoly.terrain.tile;
    const place = (b: BlockDef) => {
      const { mat, flasher } = this.blockMaterial(b.kind);
      if (b.kind === 'concrete') {
        addStaticBox(this.physics, b.pos, b.size);
        this.terrain(b.pos, b.size, b.look ?? 'rock', TT.block, undefined, b.moss);
      } else this.box(b.pos, b.size, mat);
      if (flasher) {
        for (const n of lineNodes(b.pos, b.size, TUNING.coil.chainRadius * 0.7)) {
          this.conductors.push(new ConductorNode(n, 'metal_structure', flasher));
        }
      }
    };
    for (const b of MAP.blocks as BlockDef[]) place(b);
  }

  private buildStairs() {
    const TT = VISUAL.lowpoly.terrain.tile;
    for (const s of MAP.stairs) {
      const { mat, flasher } = this.blockMaterial(s.kind);
      // 계단 한 단에서 보이는 면만: 윗면 + 양옆(진행 축의 직교 방향) + 낮은 쪽 챌판(마지막 단은 뒷면도)
      const alongX = s.dir.endsWith('x'), plus = s.dir.startsWith('+');
      const riser: FaceKey = alongX ? (plus ? 'nx' : 'px') : (plus ? 'nz' : 'pz');
      const back: FaceKey = alongX ? (plus ? 'px' : 'nx') : (plus ? 'pz' : 'nz');
      const sides: FaceKey[] = alongX ? ['pz', 'nz'] : ['px', 'nx'];
      const parts = stairBlocks(s);
      parts.forEach((p, i) => {
        if (s.kind === 'concrete') {
          addStaticBox(this.physics, p.pos, p.size);
          const faces: Partial<Record<FaceKey, boolean>> = { py: true, px: false, nx: false, pz: false, nz: false, [riser]: true, [sides[0]]: true, [sides[1]]: true, [back]: i === parts.length - 1 };
          this.terrain(p.pos, p.size, 'rock', TT.stair, faces, 0.6);
        } else this.box(p.pos, p.size, mat);
        // 금속 계단은 3단마다 노드 (간격 ≤ 연쇄 반경)
        if (flasher && i % 3 === 0) this.conductors.push(new ConductorNode(p.pos, 'metal_structure', flasher));
      });
    }
  }

  private buildWater() {
    for (const w of MAP.water) {
      const emissive = this.tmpDim(CUES.conductor, 0.3);
      const mat = createMaterial(COL.verdigris, { vertexColors: true, emissive: emissive.getHex() });
      const flasher = new Flasher([mat], emissive);
      this.flashers.push(flasher);
      this.box([w.center[0], WATER_Y / 2, w.center[1]], [w.size[0], WATER_Y, w.size[1]], mat, false);
      for (const n of gridNodes(w.center, w.size, TUNING.coil.chainRadius * 0.7, WATER_Y + 0.05)) {
        this.conductors.push(new ConductorNode(n, 'water', flasher));
      }
    }
  }
}
