import * as THREE from 'three';
import { VISUAL } from '../config/settings';

/**
 * BoxGeometry 의 UV 를 면의 실제 크기(m) / tileMeters 로 스케일해서,
 * 큰 면에서도 텍스처 픽셀 크기가 일정하게 유지되게 한다 (RepeatWrapping 텍스처 전제).
 */
export function createBoxGeometryWithUV(
  width: number, height: number, depth: number, tileMeters: number = VISUAL.textureTileMeters,
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry 면 순서: +X, -X, +Y, -Y, +Z, -Z (각 4 정점)
  const faceDims: [number, number][] = [
    [depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * faceDims[f][0] / tileMeters, uv.getY(i) * faceDims[f][1] / tileMeters);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
