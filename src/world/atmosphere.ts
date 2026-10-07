import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VISUAL } from '../config/settings';
import { MAP } from '../data/map';
import { createMaterial } from '../render/materials';
import { CUES } from '../render/palette';
import { LP } from '../render/style';
import { bobOffset, debrisPlacement } from './debris';
import { hash3 } from './blockTerrain';

/** 세로 그라디언트(+가로 가우시안) 발광 텍스처: 빛기둥의 밑이 가장 밝고 위로 사라진다. 런타임 절차 생성 */
function beamTexture(): THREE.CanvasTexture {
  const w = 32, h = 128, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!, img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1); // 0 = 맨 위(캔버스 위). flipY 로 uv.y=1 이 위
    const along = Math.pow(1 - t, 0.9) * Math.min(1, (1 - t) * 40 + 0.0) * (1 - t * 0.2); // 위로 갈수록 옅어짐
    for (let x = 0; x < w; x++) {
      const dx = (x / (w - 1)) * 2 - 1;
      const v = Math.round(255 * Math.max(0, along) * Math.exp(-dx * dx * 3.2));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * 황혼 분위기 소품 (시각 전용, 충돌 없음): 탑 위 빛기둥 + 탑 창문(청록 발광) + 떠 있는 파편.
 * (협곡 안개 면 4장 근사는 A2 에서 제거: 높이 안개는 render/materials.ts 의 셰이더 패치가 월드 y 로 계산한다)
 * 각 요소는 LP.features 로 끌 수 있다. update(dt) 를 매 프레임 호출.
 */
export class Atmosphere {
  private beams: { mesh: THREE.Mesh; mat: THREE.Material & { opacity: number }; base: number }[] = [];
  private beamGroup = new THREE.Group();
  private debris: THREE.InstancedMesh | null = null;
  private debrisItems = debrisPlacement(VISUAL.lowpoly.debris, LP.debrisColors.length);
  private t = 0;

  constructor(private scene: THREE.Scene) {
    const F = LP.features;
    if (F.windows) this.buildWindows();
    if (F.beam) this.buildBeam();
    if (F.debris) this.buildDebris();
  }

  /** 탑 네 면에 청록 발광 창 (CUES.conductor). 일부는 비워 규칙적인 격자를 피한다 */
  private buildWindows() {
    const W = VISUAL.lowpoly.windows, T = MAP.tower, geos: THREE.BufferGeometry[] = [];
    const [ww, wh] = W.size, depth = 0.2;
    for (let face = 0; face < 4; face++) {
      const alongX = face < 2, sign = face % 2 === 0 ? 1 : -1;
      for (let row = 0, y = W.firstY; y < T.h - 2; row++, y += W.rowGap) {
        for (let c = 0; c < W.columns; c++) {
          if (hash3(face, row, c, 77) < 0.28) continue;
          const off = ((c + 0.5) / W.columns - 0.5) * (T.w - 3) + (row % 2 ? 0.8 : 0);
          const g = new THREE.BoxGeometry(alongX ? ww : depth, wh, alongX ? depth : ww);
          const out = T.w / 2 + W.proud - depth / 2 + depth / 2;
          g.translate(T.x + (alongX ? off : sign * out), y, T.z + (alongX ? sign * out : off));
          geos.push(g);
        }
      }
    }
    const emissive = new THREE.Color(CUES.conductor).multiplyScalar(W.glow).getHex();
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, createMaterial(0x000000, { emissive, fog: false }));
    this.scene.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  /** 탑 지붕 중앙에서 솟는 빛기둥: 십자 평면 2장 × (중심 가는 층 + 바깥 넓은 층). 가산 발광, 안개 무시, 느린 맥동 */
  private buildBeam() {
    const B = VISUAL.lowpoly.beam, T = MAP.tower, tex = beamTexture();
    const mk = (width: number, color: number, opacity: number) => {
      const mat = createMaterial(0x000000, { emissive: color, emissiveMap: tex, fog: false }) as THREE.MeshLambertMaterial;
      mat.transparent = true; mat.depthWrite = false; mat.side = THREE.DoubleSide; mat.blending = THREE.AdditiveBlending; mat.opacity = opacity;
      for (let k = 0; k < 2; k++) {
        const geo = new THREE.PlaneGeometry(width, B.height).translate(0, B.height / 2, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = (k * Math.PI) / 2;
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        this.beamGroup.add(mesh);
      }
      this.beams.push({ mesh: this.beamGroup.children[this.beamGroup.children.length - 1] as THREE.Mesh, mat, base: opacity });
    };
    mk(B.outerWidth, LP.beamColors.outer, B.outerOpacity);
    mk(B.coreWidth, LP.beamColors.core, B.coreOpacity);
    this.beamGroup.position.set(T.x, T.roofY + 0.2, T.z);
    this.scene.add(this.beamGroup);
  }

  private buildDebris() {
    const items = this.debrisItems;
    const mat = createMaterial(0xffffff);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, items.length));
    mesh.count = items.length;
    const c = new THREE.Color();
    items.forEach((it, i) => mesh.setColorAt(i, c.setHex(LP.debrisColors[it.colorIdx])));
    mesh.frustumCulled = false;
    this.debris = mesh;
    this.updateDebris();
    this.scene.add(mesh);
  }

  private updateDebris() {
    if (!this.debris) return;
    const D = VISUAL.lowpoly.debris, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), ax = new THREE.Vector3();
    this.debrisItems.forEach((it, i) => {
      q.setFromAxisAngle(ax.set(...it.axis), it.angle0 + it.spin * this.t);
      p.set(it.x, it.y + bobOffset(it, this.t, D.bobAmp, D.bobSpeed), it.z);
      s.set(it.sx, it.sy, it.sz);
      this.debris!.setMatrixAt(i, m.compose(p, q, s));
    });
    this.debris.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    this.t += dt;
    const B = VISUAL.lowpoly.beam;
    if (this.beams.length) {
      const k = 1 + Math.sin(this.t * B.pulseSpeed * Math.PI * 2) * B.pulseAmp;
      for (const b of this.beams) b.mat.opacity = Math.min(1, b.base * k);
      this.beamGroup.rotation.y += B.spin * dt;
    }
    this.updateDebris();
  }
}
