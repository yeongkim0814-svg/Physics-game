import * as THREE from 'three';

/** 면을 maxSegment(m) 이하로 분할한 박스 (정점색 보간 해상도 확보) */
export function segmentedBox(width: number, height: number, depth: number, maxSegment: number): THREE.BoxGeometry {
  const seg = (len: number) => Math.max(1, Math.ceil(len / maxSegment));
  return new THREE.BoxGeometry(width, height, depth, seg(width), seg(height), seg(depth));
}
