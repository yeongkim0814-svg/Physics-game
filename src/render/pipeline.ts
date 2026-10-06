import * as THREE from 'three';
import { PERF, VISUAL } from '../config/settings';
import { RetroPipeline } from './retro';
import { isPS1 } from './style';

/**
 * 렌더 파이프라인 공통 인터페이스. GameLoop 는 이것만 본다.
 * width/height 는 드로잉 버퍼 크기(px). 자동 해상도 저하(PERF)는 setResolution 으로 height 를 줄인다.
 */
export interface RenderPipeline {
  width: number;
  height: number;
  /** 자동 해상도 저하의 하한 */
  readonly minHeight: number;
  /** 현재 창 크기 기준 기본 렌더 높이 */
  defaultHeight(): number;
  setResolution(height: number, aspect: number): void;
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, timeSec: number): void;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 선택 외곽선: 깊이 2차 차분(역깊이 기반이라 기울어진 평면은 검출 안 됨)으로 윤곽만 살짝 어둡게 한다
const EDGE_FRAG = /* glsl */ `
uniform sampler2D tColor, tDepth;
uniform vec2 uRes;
uniform float uNear, uFar, uStrength, uLo, uHi;
uniform vec3 uColor;
varying vec2 vUv;
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float invZ(vec2 uv) { return 1.0 / linZ(texture2D(tDepth, uv).x); }
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  vec2 px = 1.0 / uRes;
  float c = invZ(vUv);
  float m = max(abs(invZ(vUv - vec2(px.x, 0.0)) + invZ(vUv + vec2(px.x, 0.0)) - 2.0 * c),
                abs(invZ(vUv - vec2(0.0, px.y)) + invZ(vUv + vec2(0.0, px.y)) - 2.0 * c));
  float edge = smoothstep(uLo, uHi, m / max(c, 1e-5));
  gl_FragColor = vec4(mix(col, uColor, uStrength * edge), 1.0);
}`;

/**
 * 로우폴리 프리셋 파이프라인: 네이티브(또는 PERF.maxPixelRatio 상한) 해상도로 곧바로 캔버스에 그린다.
 * 저해상도 타깃·nearest 확대·양자화·디더·노이즈 없음. 외곽선(VISUAL.lowpoly.outline.enabled)을 켜면 렌더 타깃 + 후처리 1패스.
 */
export class SimplePipeline implements RenderPipeline {
  width = 1;
  height = 1;
  readonly minHeight = VISUAL.lowpoly.minHeight;
  private rt: THREE.WebGLRenderTarget | null = null;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    const cs = renderer.domElement.style;
    cs.imageRendering = 'auto';
    cs.width = '100%';
    cs.height = '100%';
    cs.display = 'block';
    cs.touchAction = 'none';

    const O = VISUAL.lowpoly.outline;
    if (O.enabled) {
      this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false } as THREE.RenderTargetOptions);
      this.rt.depthTexture = new THREE.DepthTexture(4, 4);
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: EDGE_FRAG, depthTest: false, depthWrite: false,
        uniforms: {
          tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, uRes: { value: new THREE.Vector2(1, 1) },
          uNear: { value: VISUAL.camera.near }, uFar: { value: VISUAL.camera.far },
          uStrength: { value: O.strength }, uLo: { value: O.edgeLo }, uHi: { value: O.edgeHi }, uColor: { value: new THREE.Color(O.color) },
        },
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
      quad.frustumCulled = false;
      this.postScene.add(quad);
    }
    this.setResolution(this.defaultHeight(), innerWidth / innerHeight);
  }

  defaultHeight() {
    return Math.round(innerHeight * Math.min(window.devicePixelRatio || 1, PERF.maxPixelRatio));
  }

  setResolution(height: number, aspect: number) {
    this.height = Math.max(1, Math.round(height));
    this.width = Math.max(1, Math.round(this.height * aspect));
    this.renderer.setSize(this.width, this.height, false);
    if (this.rt && this.mat) {
      this.rt.setSize(this.width, this.height);
      this.mat.uniforms.uRes.value.set(this.width, this.height);
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, _timeSec: number) {
    if (!this.rt || !this.mat) {
      this.renderer.render(scene, camera);
      return;
    }
    this.mat.uniforms.uNear.value = camera.near;
    this.mat.uniforms.uFar.value = camera.far;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}

/** 스타일에 맞는 파이프라인 */
export function createPipeline(renderer: THREE.WebGLRenderer): RenderPipeline {
  return isPS1 ? new RetroPipeline(renderer) : new SimplePipeline(renderer);
}
