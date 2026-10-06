import * as THREE from 'three';
import { VISUAL } from '../config/settings';
import { createMaterial } from './materials';
import { skyColorAt } from './skyMath';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 낮 하늘 (로우폴리 프리셋): 정점색 그라디언트 돔 + 해 원반(+옅은 후광) + 로우폴리 구름 몇 덩이.
 * 돔은 깊이를 무시하고 맨 뒤에 그리고, 해·구름은 깊이 테스트로 지형/랜드마크 뒤에 가려진다.
 * 모두 카메라 위치를 따라다녀 무한히 먼 배경처럼 보인다 (update 를 매 프레임 호출).
 */
export class DaySky {
  readonly group = new THREE.Group();
  private clouds = new THREE.Group();
  private sunDir: THREE.Vector3;

  constructor(scene: THREE.Scene) {
    const S = VISUAL.lowpoly.sky;
    this.sunDir = new THREE.Vector3(...VISUAL.lowpoly.lighting.sunDir).normalize();

    // --- 돔: 정점 y(고도)로 색을 정한다. 지평선 색 = 안개색 ---
    const dome = new THREE.SphereGeometry(S.radius, S.segments, S.rings);
    const p = dome.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.setHex(skyColorAt(p.getY(i) / S.radius, S));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthTest: false, depthWrite: false });
    const domeMesh = new THREE.Mesh(dome, domeMat);
    domeMesh.renderOrder = -1000;
    domeMesh.frustumCulled = false;
    this.group.add(domeMesh);

    // --- 해: 원반 + 후광 (카메라를 향한 평면 원) ---
    const sunPos = this.sunDir.clone().multiplyScalar(S.sun.distance);
    const disc = (radius: number, color: number, opacity: number) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 24),
        new THREE.MeshBasicMaterial({ color, fog: false, transparent: opacity < 1, opacity, depthWrite: false }),
      );
      m.position.copy(sunPos);
      m.lookAt(0, 0, 0);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    S.sun.haloScales.forEach((k, i) => disc(S.sun.radius * k, S.sun.haloColor, S.sun.haloOpacity).position.multiplyScalar(1.01 + i * 0.001));
    disc(S.sun.radius, S.sun.color, 1);

    // --- 구름: 납작한 이코사헤드론 3~5개를 뭉쳐 한 덩이 (플랫 셰이딩이 면별 음영을 만든다) ---
    const K = S.clouds, r = rng(VISUAL.lowpoly.decor.seed * 7 + 3);
    const mat = createMaterial(K.color, { fog: false, emissive: K.shade });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < K.count; i++) {
      const az = (i / K.count) * Math.PI * 2 + r() * 0.5;
      const el = K.elevMin + r() * (K.elevMax - K.elevMin);
      const cloud = new THREE.Group();
      const size = K.size[0] + r() * (K.size[1] - K.size[0]);
      const parts = Math.round(K.parts[0] + r() * (K.parts[1] - K.parts[0]));
      for (let j = 0; j < parts; j++) {
        const m = new THREE.Mesh(geo, mat);
        const s = size * (0.45 + r() * 0.4);
        m.scale.set(s, s * K.squash, s * 0.8);
        m.position.set((j - (parts - 1) / 2) * size * 0.55, (r() - 0.3) * size * 0.1, (r() - 0.5) * size * 0.3);
        cloud.add(m);
      }
      // 방위·고도 위치에 놓고 카메라(원점) 쪽을 향하게 한다
      cloud.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(K.distance);
      cloud.lookAt(0, cloud.position.y * 0.6, 0);
      this.clouds.add(cloud);
    }
    this.group.add(this.clouds);
    scene.add(this.group);
  }

  /** 카메라를 따라가고 구름 무리를 천천히 돌린다 */
  update(cam: THREE.Camera, dt: number) {
    this.group.position.copy(cam.position);
    this.clouds.rotation.y += VISUAL.lowpoly.sky.clouds.drift * dt;
  }
}
