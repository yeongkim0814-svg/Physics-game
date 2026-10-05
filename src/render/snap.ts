import * as THREE from 'three';
import { VISUAL } from '../config/settings';

/** 모든 패치된 재질이 공유하는 유니폼 (RetroPipeline 이 해상도를 갱신) */
export const retroUniforms = {
  uRes: { value: new THREE.Vector2(480, 270) },
  uSnap: { value: VISUAL.vertexSnap ? VISUAL.snapPixels : 0 },
};

/** 정점 스냅(PS1 지터): 클립 좌표를 저해상도 픽셀 격자에 맞춘다 */
export function patchRetro<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRes = retroUniforms.uRes;
    shader.uniforms.uSnap = retroUniforms.uSnap;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uRes;\nuniform float uSnap;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        if (uSnap > 0.0) {
          vec2 grid = uRes * 0.5 / uSnap;
          vec2 ndc = gl_Position.xy / gl_Position.w;
          gl_Position.xy = (floor(ndc * grid + 0.5) / grid) * gl_Position.w;
        }`);
  };
  return material;
}
