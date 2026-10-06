import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { centerOffsetY, cylinderHeight } from './backdropMath';
import { createMaterial } from './materials';

/** 에셋 폴더의 backdrop_*.png 를 URL 로 모은다 (Vite 가 해시 파일명·상대 경로(base './')로 처리). settings 의 file 이름으로 고른다 */
const FILES = import.meta.glob('../assets/backdrop_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/**
 * 원경 백드롭 (M1i): 좌우 이음새 없는 파노라마 PNG 를 카메라를 따라다니는 원통(open-ended, 안쪽 면)에 붙인다.
 * 안개 무시, depthWrite off, 가장 먼저 그린다(하늘 돔 다음). 하늘 돔 위에 알파로 겹쳐 위쪽은 돔과 자연스럽게 이어진다.
 * 파일을 같은 이름·크기로 바꾸기만 하면 교체된다 (VISUAL.lowpoly.backdrop).
 */
export class Backdrop {
  readonly mesh: THREE.Mesh | null = null;
  private yOffset = 0;

  constructor(scene: THREE.Scene) {
    const B = VISUAL.lowpoly.backdrop;
    const url = FILES[`../assets/${B.file}`];
    if (!url) { console.warn(`[backdrop] ${B.file} 없음`); return; }
    const tex = new THREE.TextureLoader().load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1; // 안쪽에서 볼 때 좌우가 뒤집히므로 되돌린다 (규약: backdropMath.azimuthToPixelX)
    tex.colorSpace = THREE.NoColorSpace;
    tex.magFilter = B.pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    const h = cylinderHeight(B);
    // 알파는 map, 색은 emissiveMap 으로 조명 없이 그대로 (재질 팩토리 경유)
    const mat = createMaterial(0x000000, { map: tex, emissive: 0xffffff, emissiveMap: tex, fog: false });
    mat.emissiveIntensity = B.brightness;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const geo = new THREE.CylinderGeometry(B.radius, B.radius, h, 96, 1, true);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -900;
    this.mesh.frustumCulled = false;
    this.yOffset = centerOffsetY(B);
    scene.add(this.mesh);
  }

  /** 카메라를 따라간다 (눈높이가 이미지 horizonV 에 오도록) */
  update(cam: THREE.Camera) {
    if (this.mesh) this.mesh.position.set(cam.position.x, cam.position.y + this.yOffset, cam.position.z);
  }
}
