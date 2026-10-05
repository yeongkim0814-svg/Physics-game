import * as THREE from 'three';
import { jaggedPath, type Vec3 } from './coilMath';

const LIFE = 0.22;
/** 전기 연쇄(기능색 amber)를 안개 속에서도 눈에 띄게 한 밝은 호박색 */
const ARC_COLOR = 0xffd98a;

interface Arc { line: THREE.LineSegments; life: number }

/** 번개 시각화: a→b 지그재그 선을 겹쳐 그려 굵어 보이게 하고 잠깐 깜빡이다 사라진다 */
export class ArcEffects {
  private arcs: Arc[] = [];
  private mat = new THREE.LineBasicMaterial({ color: ARC_COLOR, fog: false });

  constructor(private scene: THREE.Scene) {}

  spawn(a: THREE.Vector3, b: THREE.Vector3, amp = 0.25) {
    const segs = Math.max(3, Math.min(14, Math.round(a.distanceTo(b) / 1.2)));
    const pts: number[] = [];
    // 2중으로 그려 선을 굵게
    for (let k = 0; k < 2; k++) {
      const path = jaggedPath([a.x, a.y, a.z], [b.x, b.y, b.z], segs, amp * (k ? 1.6 : 1), Math.random);
      for (let i = 0; i < path.length - 1; i++) pts.push(...(path[i] as Vec3), ...(path[i + 1] as Vec3));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.LineSegments(geo, this.mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.arcs.push({ line, life: LIFE });
  }

  get count() { return this.arcs.length; }

  update(dt: number) {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      a.line.visible = a.life > 0 && Math.floor(a.life * 40) % 2 === 0 || a.life > LIFE * 0.7; // 끝으로 갈수록 깜빡임
      if (a.life <= 0) { this.scene.remove(a.line); a.line.geometry.dispose(); this.arcs.splice(i, 1); }
    }
  }
}
