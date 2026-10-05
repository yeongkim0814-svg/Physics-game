import { startHub } from './hub/boot';
import { startRaid } from './raid/RaidLoop';

const root = document.getElementById('app')!;
const dev = new URLSearchParams(location.search).get('dev');
if (dev === 'grid') import('./dev/gridTest').then((m) => m.startGridTest(root));
else if (dev === 'raid') import('./dev/quickRaid').then((m) => m.startQuickRaid(root));
else startHub(root, (save) => startRaid(root, save));
