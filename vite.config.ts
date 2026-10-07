import { defineConfig, loadEnv } from 'vite';
import { configDefaults } from 'vitest/config';

// base 를 './' (상대 경로)로 두면 github.io/<저장소명>/ 어떤 하위 경로에서도, 로컬 dev 에서도 동일하게 동작한다.
// 저장소명 고정이 꼭 필요하면 환경변수 VITE_BASE=/<저장소명>/ 로 덮어쓴다.
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, '.', 'VITE_').VITE_BASE || './',
  build: { chunkSizeWarningLimit: 2500 }, // rapier wasm(base64) 때문에 큼
  // git worktree(.claude/worktrees/*)의 같은 테스트를 이중 실행하지 않는다
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
}));
