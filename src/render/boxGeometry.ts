import * as THREE from 'three';

/**
 * BoxGeometry 에 자동으로 적절한 UV 를 설정.
 * (정점 스냅과 UV 반복 때문에 기본 UV 로는 면마다 텍스처가 어색함)
 */
export function createBoxGeometryWithUV(width: number, height: number, depth: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth);
  
  // 각 면: 상하좌우 6면 × 4 정점
  const uvArray: number[] = [];
  // face 순서: +X, -X, +Y, -Y, +Z, -Z
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      uvArray.push(v % 2, Math.floor(v / 2));
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArray), 2));
  return geo;
}
