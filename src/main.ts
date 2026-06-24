import { readWorkspaceFromUrl } from '@/core/url-state/codec';
import { initApp } from '@/app/store';
import { log } from '@/logs/logger';
import '@/ui/styles/main.css';

log.info('boot', 'Playlists Randomizer starting', {
  base: import.meta.env.BASE_URL,
  version: import.meta.env.VITE_URL_STATE_VERSION,
});

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const workspace = readWorkspaceFromUrl();
initApp(app, workspace);

log.info('boot', 'App initialized', { lists: workspace.lists.length });
