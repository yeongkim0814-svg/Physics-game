import * as THREE from 'three';
import { VISUAL } from '../config/settings';

/**
 * UV 를 면의 실제 크기(m) / tileMeters 로 스케일해 큰 면에서도 텍스처 픽셀 크기를 일정하게 유지하고,
 * 면을 maxSegment(m) 이하로 분할한다. 정점 스냅(PS1 지터)은 정점마다 독립이라, 100m 짜리 폴리곤은
 * 먼 정점의 오차가 면 전체 텍스처를 출렁이게 한다 → 작은 조각으로 나누면 오차가 국소화된다.
 */
export function createBoxGeometryWithUV(
  width: number, height: number, depth: number,
  tileMeters: number = VISUAL.textureTileMeters, maxSegment: number = VISUAL.maxPolySize,
): THREE.BoxGeometry {
  const seg = (len: number) => Math.max(1, Math.ceil(len / maxSegment));
  const [ws, hs, ds] = [seg(width), seg(height), seg(depth)];
  const geo = new THREE.BoxGeometry(width, height, depth, ws, hs, ds);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry 면 순서 +X, -X, +Y, -Y, +Z, -Z. 면별 정점 수와 실제 크기
  const faces: { verts: number; dims: [number, number] }[] = [
    { verts: (ds + 1) * (hs + 1), dims: [depth, height] }, { verts: (ds + 1) * (hs + 1), dims: [depth, height] },
    { verts: (ws + 1) * (ds + 1), dims: [width, depth] }, { verts: (ws + 1) * (ds + 1), dims: [width, depth] },
    { verts: (ws + 1) * (hs + 1), dims: [width, height] }, { verts: (ws + 1) * (hs + 1), dims: [width, height] },
  ];
  let i = 0;
  for (const f of faces) {
    for (let v = 0; v < f.verts; v++, i++) {
      uv.setXY(i, uv.getX(i) * f.dims[0] / tileMeters, uv.getY(i) * f.dims[1] / tileMeters);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
