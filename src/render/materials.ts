import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { DESAT_MAX_REGIONS, type DesatRegion } from './desat';
import { LP } from './style';
import { atlasPixels, TEX_KINDS, type TexKind } from './texKit';

// 색을 코드에서 쓴 그대로 출력 (조명·안개 계산을 단순하게). Color 생성보다 먼저 설정해야 한다.
THREE.ColorManagement.enabled = false;

/** 저해상도 절차 텍스처 (G3): 월드 좌표 트리플래너. top = 윗면(법선 y>0.7), side = 옆면. glow>0 이면 텍스처 알파(발광선)를 decor 청록으로 발광 */
export interface TexOpts { top: TexKind; side: TexKind; tile: number; amp: number; glow?: number }

export interface MaterialOpts {
  tex?: TexOpts;
  map?: THREE.Texture;
  /** 가독성 단서용 발광색 (CUES) */
  emissive?: number;
  /** 발광 텍스처 (하늘돔 등: 조명 영향 없이 텍스처 색 그대로) */
  emissiveMap?: THREE.Texture;
  /** false 면 안개 무시(탈출 지점 표식 등 원거리에서도 보여야 하는 것) */
  fog?: boolean;
  /** 지오메트리 정점색(color 속성/instanceColor)을 곱한다 (로우폴리: 텍스처 대신 쓰는 명도 변화) */
  vertexColors?: boolean;
  /** 이 재질만의 탈색 0~1 (로우폴리). setMaterialDesaturation 으로 런타임 변경 */
  desaturate?: number;
  /** (로우폴리) 알베도 × 이 색을 자체 발광으로 더한다: 그늘 면에서도 색이 살게 (조명 무관, 알베도에 비례하는 따뜻한 보정광) */
  selfGlow?: readonly [number, number, number];
  /** (로우폴리) 림 라이트: 시선과 비스듬한 가장자리에 더하는 얇은 역광 효과. color 0xRRGGBB, strength 0..1, power 지수(클수록 얇음) */
  rim?: { color: number; strength: number; power: number };
}

/** 텍스처 아틀라스 (층 = TEX_KINDS): 한 장을 모든 재질이 공유한다. NearestFilter·밉맵 없음 = 픽셀이 그대로 보인다 */
let atlas: THREE.DataTexture | null = null;
function texAtlas() {
  if (atlas) return atlas;
  const T = VISUAL.lowpoly.texture;
  atlas = new THREE.DataTexture(atlasPixels(T.size, T.seed), T.size, T.size * TEX_KINDS.length, THREE.RGBAFormat);
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.needsUpdate = true;
  return atlas;
}

/** 지역 탈색 공유 유니폼: 모든 로우폴리 재질이 월드 xz 위치로 같은 지역 목록을 본다 */
const regionUniform = { value: Array.from({ length: DESAT_MAX_REGIONS }, () => new THREE.Vector4(0, 0, 1, 0)) };
const softUniform = { value: VISUAL.lowpoly.desat.softness };

/** 탈색 지역을 설정한다 (최대 DESAT_MAX_REGIONS 개, 나머지는 해제). 지역 밖 색은 그대로 */
export function setDesatRegions(regions: readonly DesatRegion[]) {
  regionUniform.value.forEach((v, i) => {
    const r = regions[i];
    if (r) v.set(r[0], r[1], r[2], r[3]); else v.set(0, 0, 1, 0);
  });
}
setDesatRegions(VISUAL.lowpoly.desat.regions);

/**
 * 셰이더 높이 안개 공유 유니폼 (C6, 프리셋 LP.fog.height). x = top, y = 1/falloff, z = density(0 이면 꺼짐).
 * 모든 로우폴리 재질(지형·장식·캐릭터·파편)이 월드 y 로 같은 안개를 본다. 하늘·백드롭·빛기둥은 fog:false 라 제외.
 */
const HF = LP.fog.height;
const heightFogUniform = { value: new THREE.Vector4(HF?.top ?? 0, 1 / Math.max(1e-3, HF?.falloff ?? 1), HF?.density ?? 0, 0) };
const heightFogColor = { value: new THREE.Color(HF?.color ?? 0xffffff) };

/** 재질 하나의 탈색(0~1) 변경. 로우폴리 재질만 유효 */
export function setMaterialDesaturation(m: THREE.Material, amount: number) {
  const u = m.userData.desat as { value: number } | undefined;
  if (u) u.value = Math.min(1, Math.max(0, amount));
}

/** 로우폴리 재질 패치: 월드 위치 varying + 재질/지역 탈색을 알베도에 적용 (식은 desat.ts 와 동일) */
function patchLowpoly(material: THREE.Material, desat: { value: number }, o: MaterialOpts = {}) {
  material.userData.desat = desat;
  const glow = { value: new THREE.Vector3(...(o.selfGlow ?? [0, 0, 0])) };
  const rimColor = { value: new THREE.Color(o.rim?.color ?? 0) };
  const rimStrength = { value: o.rim?.strength ?? 0 };
  const rimPower = { value: o.rim?.power ?? 3 };
  const tx = o.tex, Tn = VISUAL.lowpoly.texture;
  const texUniforms = tx ? {
    uTex: { value: texAtlas() }, uTexN: { value: Tn.size }, uTexLayers: { value: TEX_KINDS.length },
    uTexTop: { value: TEX_KINDS.indexOf(tx.top) }, uTexSide: { value: TEX_KINDS.indexOf(tx.side) },
    uTexTile: { value: tx.tile }, uTexAmp: { value: tx.amp }, uTexFade: { value: new THREE.Vector3(Tn.fadeNear, Tn.fadeEnd, Tn.glowAvg) },
    uTexGlow: { value: new THREE.Color(VISUAL.lowpoly.tech.decorColor).multiplyScalar(tx.glow ?? 0) },
  } : null;
  // 텍스처 유무로 셰이더 코드가 달라지므로 프로그램 캐시 키를 분리한다
  material.customProgramCacheKey = () => (tx ? 'lowpoly-tex' : 'lowpoly');
  material.onBeforeCompile = (shader) => {
    if (texUniforms) Object.assign(shader.uniforms, texUniforms);
    shader.uniforms.uDesat = desat;
    shader.uniforms.uSelfGlow = glow;
    shader.uniforms.uRimColor = rimColor;
    shader.uniforms.uRimStrength = rimStrength;
    shader.uniforms.uRimPower = rimPower;
    shader.uniforms.uRegions = regionUniform;
    shader.uniforms.uFogH = heightFogUniform;
    shader.uniforms.uFogHColor = heightFogColor;
    shader.uniforms.uSoft = softUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDesatPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp;
        #endif
        vDesatPos = (modelMatrix * dwp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDesatPos;
        uniform float uDesat;
        uniform float uSoft;
        uniform vec3 uSelfGlow;
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uRimPower;
        uniform vec4 uRegions[${DESAT_MAX_REGIONS}];
        uniform vec4 uFogH;
        uniform vec3 uFogHColor;${tx ? `
        uniform sampler2D uTex;
        uniform float uTexN, uTexLayers, uTexTop, uTexSide, uTexTile, uTexAmp;
        uniform vec3 uTexGlow;
        uniform vec3 uTexFade;` : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${tx ? `// 저해상도 트리플래너: 평면 셰이딩이라 면 법선(월드 위치 미분)의 지배축 하나로만 투영한다. 픽셀 중심으로 스냅해 텍셀이 그대로 보인다
        vec3 fnW = abs(normalize(cross(dFdx(vDesatPos), dFdy(vDesatPos))));
        bool isTop = fnW.y > 0.7;
        vec2 puv = (isTop ? vDesatPos.xz : vec2(fnW.x > fnW.z ? vDesatPos.z : vDesatPos.x, vDesatPos.y)) / uTexTile;
        vec2 tc = (floor(fract(puv) * uTexN) + 0.5) / uTexN;
        vec4 txl = texture2D(uTex, vec2(tc.x, ((isTop ? uTexTop : uTexSide) + tc.y) / uTexLayers));
        float lpFade = smoothstep(uTexFade.x, uTexFade.y, distance(vDesatPos, cameraPosition));
        diffuseColor.rgb *= 1.0 + (txl.rgb - 0.5) * 2.0 * uTexAmp * (1.0 - lpFade);
        float lpGlow = mix(txl.a, uTexFade.z, lpFade * step(0.001, uTexGlow.x + uTexGlow.y + uTexGlow.z));` : ''}
        float dAmt = uDesat;
        for (int i = 0; i < ${DESAT_MAX_REGIONS}; i++) {
          vec4 rg = uRegions[i];
          if (rg.z > 0.0 && rg.w > 0.0) {
            float dd = distance(vDesatPos.xz, rg.xy);
            dAmt = max(dAmt, rg.w * (1.0 - smoothstep(rg.z * (1.0 - uSoft), rg.z, dd)));
          }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), clamp(dAmt, 0.0, 1.0));`)
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          // 거리 안개(기존) 위에 높이 안개를 얹는다: 밀도 ρ(y)=density·exp(-(y-top)/falloff) 의 카메라→프래그먼트 선분 적분
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          vec3 fogMixed = mix(gl_FragColor.rgb, fogColor, fogFactor);
          if (uFogH.z > 0.0) {
            vec3 toP = vDesatPos - cameraPosition;
            float k = uFogH.y;
            float e0 = exp(clamp(-(cameraPosition.y - uFogH.x) * k, -10.0, 6.0));
            float dyk = toP.y * k;
            float integ = abs(dyk) < 0.002 ? e0 : e0 * (1.0 - exp(clamp(-dyk, -14.0, 14.0))) / dyk;
            float hf = 1.0 - exp(-uFogH.z * length(toP) * max(integ, 0.0));
            fogMixed = mix(fogMixed, uFogHColor, clamp(hf, 0.0, 1.0));
          }
          gl_FragColor.rgb = fogMixed;
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uSelfGlow;${tx ? `
        totalEmissiveRadiance += uTexGlow * lpGlow;` : ''}
        if (uRimStrength > 0.0) {
          float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
          totalEmissiveRadiance += uRimColor * (rimF * uRimStrength);
        }`);
  };
}

/** 모든 메시의 기본 재질 팩토리. Lambert + flatShading + 탈색·높이 안개·selfGlow·rim 패치 */
export function createMaterial(color: number, o: MaterialOpts = {}) {
  const m = new THREE.MeshLambertMaterial({
    color, flatShading: true, emissive: o.emissive ?? 0x000000, fog: o.fog ?? true,
    ...(o.map ? { map: o.map } : {}), // map: undefined 를 넘기면 three 가 경고한다
    ...(o.emissiveMap ? { emissiveMap: o.emissiveMap } : {}),
    ...(o.vertexColors ? { vertexColors: true } : {}),
  });
  patchLowpoly(m, { value: o.desaturate ?? 0 }, o);
  return m;
}
