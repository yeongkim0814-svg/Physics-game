import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { getTexture, type TexKind } from './textures';

// 색을 코드에서 쓴 그대로 출력(PS1풍 + 후처리 계산 단순화). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** 모든 PS1 재질이 공유하는 유니폼 (참조 공유 → 한 곳 수정으로 전체 반영) */
export const shared = {
  uResolution: { value: new THREE.Vector2(VISUAL.internalWidth, Math.round(VISUAL.internalWidth * 9 / 16)) },
  uSnap: { value: VISUAL.vertexSnap ? VISUAL.snapPixels : 0 },
  uAffine: { value: VISUAL.affineTexture ? 1 : 0 },
  uTexScale: { value: VISUAL.textureTileMeters },
  uFogColor: { value: new THREE.Color(VISUAL.fog.color) },
  uFogNear: { value: VISUAL.fog.near },
  uFogFar: { value: VISUAL.fog.far },
  uAmbient: { value: new THREE.Color(VISUAL.lighting.ambient) },
  uSunColor: { value: new THREE.Color(VISUAL.lighting.sun) },
  uSunDir: { value: new THREE.Vector3(...VISUAL.lighting.sunDir).normalize() },
};

const VERT = /* glsl */ `
uniform vec2 uResolution;
uniform float uSnap, uAffine, uTexScale;
uniform vec3 uAmbient, uSunColor, uSunDir;
varying vec3 vUvK;
varying vec3 vLight;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  if (uSnap > 0.0) {                       // 정점 스냅: NDC 를 내부 픽셀 격자에 맞춘다
    vec2 grid = uResolution * 0.5 / uSnap;
    vec2 ndc = clip.xy / clip.w;
    clip.xy = (floor(ndc * grid + 0.5) / grid) * clip.w;
  }
  gl_Position = clip;

  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  #ifdef PS1_WORLD_UV
    vec3 p = wp; vec3 an = abs(wn);
  #else
    vec3 p = position; vec3 an = abs(normal);
  #endif
  vec2 uv = (an.y >= an.x && an.y >= an.z) ? p.xz : (an.x >= an.z ? p.zy : p.xy);
  uv /= uTexScale;
  // 어파인: uv*w 와 w 를 함께 보간하고 fragment 에서 나누면 화면 공간 선형 보간이 된다
  float k = mix(1.0, clip.w, uAffine);
  vUvK = vec3(uv * k, k);

  float sun = max(dot(wn, uSunDir), 0.0);   // 정점(고로) 조명
  vLight = uAmbient * (0.75 + 0.25 * wn.y) + uSunColor * sun;
  vView = mv.xyz; // 안개는 프래그먼트에서 계산 (큰 폴리곤이 통째로 안개색이 되는 것 방지)
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor, uEmissive, uFogColor;
uniform float uFogNear, uFogFar;
varying vec3 vUvK;
varying vec3 vLight;
varying vec3 vView;
void main() {
  vec3 base = uColor;
  #ifdef PS1_MAP
    base *= texture2D(uMap, vUvK.xy / vUvK.z).rgb;
  #endif
  float fog = clamp((length(vView) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 c = mix(base * vLight, uFogColor, fog);
  c += uEmissive * (1.0 - 0.5 * fog);       // 발광(단서 색)은 안개에 덜 묻힌다
  gl_FragColor = vec4(c, 1.0);
}`;

export interface PS1MaterialOpts {
  texture?: TexKind;
  color?: number;
  /** 가독성 단서용 발광색 (CUES 참고) */
  emissive?: number;
  /** false 면 오브젝트 로컬 좌표로 UV (움직이는 물체용). 기본 true(월드 좌표) */
  worldUV?: boolean;
}

export function createPS1Material(o: PS1MaterialOpts = {}) {
  const defines: Record<string, string> = {};
  if (o.texture) defines.PS1_MAP = '';
  if (o.worldUV !== false) defines.PS1_WORLD_UV = '';
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: {
      ...shared,
      uMap: { value: o.texture ? getTexture(o.texture) : null },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
    },
  });
}

/** 윤곽선(반전 외피). 어두운 곳에서 적·전도체 식별용 */
export function addOutline(mesh: THREE.Mesh, color: number, scale = 1.08) {
  const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  o.scale.setScalar(scale);
  mesh.add(o);
  return o;
}
