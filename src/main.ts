import { startHub } from './hub/boot';
import { startRaid } from './raid/RaidLoop';

const root = document.getElementById('app')!;
const dev = new URLSearchParams(location.search).get('dev');
if (dev === 'grid') import('./dev/gridTest').then((m) => m.startGridTest(root));
else startHub(root, () => startRaid(root));
