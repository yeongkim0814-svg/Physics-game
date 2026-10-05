import * as THREE from 'three';
import { PERF, VISUAL } from '../config/settings';
import { shared } from './materials';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 저해상도 렌더 타깃을 nearest 로 확대하면서 색 양자화 + 디더 + 노이즈
const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime, uLevels, uDither, uNoise;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec2 px = floor(vUv * uRes);
  c += (hash(px + floor(uTime * 12.0)) - 0.5) * uNoise;
  if (uLevels > 1.0) {
    float d = ign(px) - 0.5;
    c = floor(c * (uLevels - 1.0) + 0.5 + d * uDither) / (uLevels - 1.0);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class PS1Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VISUAL.fov, 16 / 9, 0.05, 300);
  internalWidth: number = VISUAL.internalWidth;

  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private post: THREE.ShaderMaterial;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    root.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(VISUAL.fog.color);
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false,
    } as THREE.RenderTargetOptions);

    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      uniforms: {
        tScene: { value: this.rt.texture },
        uRes: shared.uResolution,
        uTime: { value: 0 },
        uLevels: { value: 0 }, uDither: { value: 0 }, uNoise: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.setPostprocess(PERF.postprocess);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setPostprocess(on: boolean) {
    const u = this.post.uniforms;
    u.uLevels.value = on ? VISUAL.colorLevels : 0;
    u.uDither.value = on ? VISUAL.ditherStrength : 0;
    u.uNoise.value = on ? VISUAL.noiseStrength : 0;
  }

  setInternalWidth(w: number) {
    this.internalWidth = Math.max(VISUAL.minInternalWidth, Math.round(w));
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, PERF.pixelRatioCap));
    this.renderer.setSize(w, h, false);
    const iw = this.internalWidth;
    const ih = Math.max(1, Math.round(iw * h / w));
    this.rt.setSize(iw, ih);
    shared.uResolution.value.set(iw, ih);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(timeSec: number) {
    this.post.uniforms.uTime.value = timeSec;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
