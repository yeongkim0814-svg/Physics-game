import * as THREE from 'three';
import { createPhysics, addStaticBox } from '../core/physics';
import { Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';

/** T1 단계: 임시 맵 + 플레이어. 이후 T4/T8 에서 world/·레이드 상태로 대체된다. */
export async function startRaid(root: HTMLElement) {
  const world = await createPhysics();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a7c4);
  scene.fog = new THREE.Fog(0x87a7c4, 40, 160);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 500);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const box = (c: [number, number, number], s: [number, number, number], color: number) => {
    addStaticBox(world, c, s);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshLambertMaterial({ color }));
    m.position.set(...c);
    scene.add(m);
  };
  box([0, -0.5, 0], [200, 1, 200], 0x55703f); // 바닥
  box([8, 0.75, -10], [4, 1.5, 4], 0x888888);
  box([-8, 1.5, -14], [6, 3, 6], 0x777777);
  box([0, 4, -30], [12, 8, 12], 0x666666); // 높은 지형(점프 테스트용)
  for (let i = 0; i < 5; i++) box([-6 + i * 3, 0.2 * (i + 1), -4 - i * 0.01], [3, 0.4 * (i + 1), 1], 0x998877); // 계단

  const input = new Input(renderer.domElement);
  const player = new PlayerController(world, camera, new THREE.Vector3(0, 1, 6));

  if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { player };

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;color:#fff;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    player.update(dt, input);
    world.step();
    renderer.render(scene, camera);
    hud.textContent = input.locked
      ? `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}`
      : '클릭하여 시작 (WASD 이동, 마우스 조준, Space 점프)';
    input.endFrame();
  });
}
