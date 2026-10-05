import { createHubShell } from './HubShell';
import { storage } from './storage';
import { settleDeath } from './state';
import { homeScreen } from './screens/home';
import { stashScreen } from './screens/stash';
import { analyzerScreen } from './screens/analyzer';
import { researchScreen } from './screens/research';
import { workbenchScreen } from './screens/workbench';
import { treeScreen } from './screens/tree';
import { prepScreen } from './screens/prep';
import { intakeScreen } from './screens/intake';
import type { HubSave } from './save';

/** 허브 시작. 저장을 불러오고, 레이드 도중 이탈한 흔적(save.raid)이 있으면 사망으로 처리한 뒤 허브를 연다 */
export function startHub(root: HTMLElement, onLaunchRaid: (save: HubSave) => void) {
  const save = storage.load();
  let notice = '';
  if (save.raid) {
    const rep = settleDeath(save); // 레이드 중 창을 닫은 경우: 소지품 손실, 안전 보관함 유지
    notice = `이전 레이드를 마치지 않고 종료해 사망 처리됨 — 잃은 아이템 ${rep.lost.length}개 (안전 보관함 ${rep.kept.length}개는 유지)`;
    save.log.push(notice);
    storage.save(save);
  }
  storage.save(save); // 새 게임이면 첫 상태를 바로 기록
  const shell = createHubShell(root, save, {
    home: homeScreen, stash: stashScreen, analyzer: analyzerScreen, research: researchScreen,
    workbench: workbenchScreen, tree: treeScreen, prep: prepScreen,
  }, intakeScreen, () => { shell.destroy(); onLaunchRaid(save); });
  if (notice) setTimeout(() => shell.ctx.toast(notice, true), 400);
  return shell;
}
