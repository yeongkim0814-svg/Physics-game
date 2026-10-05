import * as THREE from 'three';
import { createPhysics, addStaticBox } from '../core/physics';
import { Input } from '../core/input';
import { PlayerController } from '../player/PlayerController';
import { PS1Renderer } from '../render/PS1Renderer';
import { createPS1Material, addOutline, type PS1MaterialOpts } from '../render/materials';
import { CUES, PERF, VISUAL } from '../config/settings';
import { createOverlays } from '../ui/overlays';

/** T1 단계: 임시 맵 + 플레이어. 이후 T4/T8 에서 world/·레이드 상태로 대체된다. */
export async function startRaid(root: HTMLElement) {
  const world = await createPhysics();
  const gfx = new PS1Renderer(root);
  const { scene, camera } = gfx;
  const input = new Input(gfx.renderer.domElement, root);
  const overlays = createOverlays(root, () => input.touch.enabled);

  const box = (c: [number, number, number], s: [number, number, number], mat: PS1MaterialOpts, collide = true) => {
    if (collide) addStaticBox(world, c, s);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...s), createPS1Material(mat));
    m.position.set(...c);
    scene.add(m);
    return m;
  };
  box([0, -0.5, 0], [200, 1, 200], { texture: 'dirt' });
  box([8, 0.75, -10], [4, 1.5, 4], { texture: 'concrete' });
  box([-8, 1.5, -14], [6, 3, 6], { texture: 'concrete' });
  box([0, 4, -30], [12, 8, 12], { texture: 'concrete' }); // 높은 지형
  for (let i = 0; i < 5; i++) box([-6 + i * 3, 0.2 * (i + 1), -4], [3, 0.4 * (i + 1), 1], { texture: 'rust' }); // 계단
  // --- 가독성 확인용 임시 오브젝트 (T4 에서 정식 맵으로 대체) ---
  box([-16, 0.03, 8], [14, 0.06, 14], { texture: 'water', emissive: 0x0a2a66 }, false); // 물웅덩이
  addOutline(box([16, 1.5, -8], [3, 3, 3], { texture: 'metal', emissive: 0x0b2a3a }), CUES.metal);  // 금속 구조물
  const exit = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 14, 6), createPS1Material({ color: 0x000000, emissive: CUES.exit }));
  exit.position.set(0, 7, -60);
  scene.add(exit);

  const player = new PlayerController(world, camera, new THREE.Vector3(0, 1, 6));
  if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { player, gfx, input };

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:5;color:#cfd;font:12px monospace;white-space:pre;pointer-events:none';
  root.appendChild(hud);

  let last = performance.now();
  let frames = 0, accum = 0, cooldown = 3;
  renderer_loop();

  function renderer_loop() {
    gfx.renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      player.update(dt, input);
      world.step();
      gfx.render(now / 1000);

      // FPS 측정 + 자동 해상도: 프레임이 떨어지면 내부 해상도를 먼저 낮춘다
      frames++; accum += dt; cooldown -= dt;
      if (accum >= 1) {
        const fps = frames / accum;
        overlays.setFps(fps, gfx.internalWidth);
        if (PERF.autoResolution && cooldown <= 0 && fps < PERF.targetFps && gfx.internalWidth > VISUAL.minInternalWidth) {
          gfx.setInternalWidth(gfx.internalWidth * PERF.autoResolutionStep);
          cooldown = 3;
        }
        frames = 0; accum = 0;
      }
      overlays.updateOrientation();

      hud.textContent = input.active
        ? `speed ${player.velocity.length().toFixed(1)} m/s  ${player.grounded ? 'ground' : 'air'}`
        : '클릭하여 시작 (WASD 이동, 마우스 조준, Space 점프, E 사용)';
      input.endFrame();
    });
  }
}
