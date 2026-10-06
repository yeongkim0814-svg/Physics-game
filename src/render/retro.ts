import * as THREE from 'three';
import { VISUAL, PERF } from '../config/settings';
import { retroUniforms } from './snap';
import type { RenderPipeline } from './pipeline';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 후처리 순서: 깊이 윤곽선 → 색 보정 → 비네팅 → CRT(그레인+주사선) → 바이어 디더
const FRAG = /* glsl */ `
uniform sampler2D tColor, tDepth;
uniform vec2 uRes;
uniform float uTime, uNear, uFar, uPost;
uniform float uEdge, uEdgeLo, uEdgeHi, uSat, uContrast, uBlack, uVig, uGrain, uGrainSpeed, uScan, uLevels;
uniform vec3 uTint;
varying vec2 vUv;

float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
// 역깊이(1/z)는 평면에서 화면 공간 선형 → 2차 차분이 0. 바닥/벽 같은 기울어진 면이 윤곽선으로 오검출되지 않는다
float invZ(vec2 uv) { return 1.0 / linZ(texture2D(tDepth, uv).x); }
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  vec2 a = mod(q, 2.0), b = floor(q * 0.5);
  return (4.0 * mod(2.0 * a.x + 3.0 * a.y, 4.0) + mod(2.0 * b.x + 3.0 * b.y, 4.0)) / 16.0;
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uPost > 0.5) {
    // 1. 깊이 윤곽선 (상대 기울기)
    vec2 px = 1.0 / uRes;
    float c = invZ(vUv);
    float m = max(abs(invZ(vUv - vec2(px.x, 0.0)) + invZ(vUv + vec2(px.x, 0.0)) - 2.0 * c),
                  abs(invZ(vUv - vec2(0.0, px.y)) + invZ(vUv + vec2(0.0, px.y)) - 2.0 * c));
    float edge = smoothstep(uEdgeLo, uEdgeHi, m / max(c, 1e-5));
    col *= 1.0 - uEdge * edge;

    // 2. 색 보정: 채도↓ 대비↑ 색조 검정 최소값
    float lightness = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lightness), col, uSat);
    col = (col - 0.5) * uContrast + 0.5;
    col *= uTint;
    col = uBlack + col * (1.0 - uBlack);

    // 3. 비네팅
    vec2 d = vUv - 0.5;
    col *= 1.0 - dot(d, d) * uVig;

    // 4. CRT: 그레인 + 수평 주사선 (gl_FragCoord = 저해상도 캔버스 픽셀)
    float grain = fract(sin(dot(gl_FragCoord.xy + uTime * uGrainSpeed, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * uGrain;
    col *= 1.0 - step(0.5, fract(gl_FragCoord.y * 0.5)) * uScan;

    // 5. 디더: 채널당 uLevels 단계 + 4x4 바이어
    col = floor(col * (uLevels - 1.0) + bayer4(gl_FragCoord.xy) + 0.03125) / (uLevels - 1.0);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/**
 * 저해상도(기본 480×270) 렌더 타깃에 색+깊이를 그리고, 후처리 패스로 캔버스에 옮긴다.
 * 캔버스 버퍼 자체가 저해상도이고 CSS(image-rendering: pixelated)가 확대한다.
 */
export class RetroPipeline implements RenderPipeline {
  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  width = 480;
  height = 270;
  readonly minHeight = VISUAL.minInternalHeight;

  constructor(private renderer: THREE.WebGLRenderer) {
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    const cs = renderer.domElement.style;
    cs.imageRendering = 'pixelated';
    cs.width = '100%';
    cs.height = '100%';
    cs.display = 'block';
    cs.touchAction = 'none';

    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    } as THREE.RenderTargetOptions);
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);

    const P = VISUAL.post;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        uRes: retroUniforms.uRes, uTime: { value: 0 },
        uNear: { value: VISUAL.camera.near }, uFar: { value: VISUAL.camera.far },
        uPost: { value: PERF.postprocess ? 1 : 0 },
        uEdge: { value: P.edge }, uEdgeLo: { value: P.edgeLo }, uEdgeHi: { value: P.edgeHi },
        uSat: { value: P.saturation }, uContrast: { value: P.contrast },
        uTint: { value: new THREE.Vector3(...P.tint) }, uBlack: { value: P.black },
        uVig: { value: P.vignette }, uGrain: { value: P.grain }, uGrainSpeed: { value: P.grainSpeed },
        uScan: { value: P.scanline }, uLevels: { value: P.levels },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.setResolution(VISUAL.internalHeight, innerWidth / innerHeight);
  }

  defaultHeight() { return VISUAL.internalHeight; }

  setPostprocess(on: boolean) { this.mat.uniforms.uPost.value = on ? 1 : 0; }

  /** 세로 해상도 기준 (예: 270 → 16:9 에서 480×270) */
  setResolution(height: number, aspect: number) {
    this.height = Math.max(1, Math.round(height));
    this.width = Math.max(1, Math.round(this.height * aspect));
    this.renderer.setSize(this.width, this.height, false);
    this.rt.setSize(this.width, this.height);
    retroUniforms.uRes.value.set(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, timeSec: number) {
    this.mat.uniforms.uTime.value = timeSec;
    this.mat.uniforms.uNear.value = camera.near;
    this.mat.uniforms.uFar.value = camera.far;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
