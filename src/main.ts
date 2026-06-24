import { readWorkspaceFromUrl } from '@/core/url-state/codec';
import { initApp } from '@/app/store';
import { log } from '@/logs/logger';
import { initLocale } from '@/i18n';
import '@/ui/styles/main.css';

initLocale();

function injectFonts(): void {
  const b = import.meta.env.BASE_URL;
  const faces = [
    ['400', 'SF-Pro-Display-Regular.otf'],
    ['500', 'SF-Pro-Display-Medium.otf'],
    ['700', 'SF-Pro-Display-Bold.otf'],
  ];
  const css = faces
    .map(
      ([w, f]) =>
        `@font-face{font-family:'SF Pro Display';src:url('${b}fonts/${f}') format('opentype');font-weight:${w};font-display:swap;}`
    )
    .join('');
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

injectFonts();
initParallaxBubbles();

function initParallaxBubbles(): void {
  const bubbles = document.querySelector('.bg-bubbles');
  if (!bubbles) return;
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        (bubbles as HTMLElement).style.transform = `translateY(${y * 0.12}px)`;
        ticking = false;
      });
    },
    { passive: true }
  );
}

log.info('boot', 'Playlists Randomizer starting', {
  base: import.meta.env.BASE_URL,
  version: import.meta.env.VITE_URL_STATE_VERSION,
});

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const workspace = readWorkspaceFromUrl();
initApp(app, workspace);

log.info('boot', 'App initialized', { lists: workspace.lists.length });
