import type { Workspace } from '../../src/core/models/workspace';

/** Plain workspace fixture — no Vite import.meta in Node/Playwright. */
export function buildE2EWorkspace(): Workspace {
  return {
    version: 2,
    lists: [
      {
        id: 'e2e-list',
        name: 'E2E List',
        cards: [
          {
            id: 'e2e-card',
            name: 'E2E Card',
            playlistIds: ['PLtest123456789'],
            settings: {
              random: true,
              showVideo: false,
              noAds: true,
              autoplayNext: true,
            },
            currentVideoIndex: 0,
          },
        ],
      },
    ],
    activeListId: 'e2e-list',
  };
}

export const overlaySelectors = {
  overlay: '.video-overlay:not([hidden])',
  playerMount: '.player-mount-overlay',
  stage: '.video-overlay-stage',
  playlistSidebar: '.playlist-sidebar.is-visible',
  globalPlayer: '#global-player-root.visible',
};

export async function seedE2EWorkspace(page: import('@playwright/test').Page, ws = buildE2EWorkspace()): Promise<void> {
  await page.addInitScript((workspace) => {
    window.__PRR_E2E_WS__ = workspace;
  }, ws);
  await page.goto('/');
}

export async function controlOrder(page: import('@playwright/test').Page, scope: string) {
  const main = page.locator(`${scope} .controls-row-main`).first();
  const buttons = main.locator('button');
  await expectButtonLabel(buttons.nth(0), 'Search videos');
  await expectButtonLabel(buttons.nth(1), 'Previous');
  await expectButtonLabel(buttons.nth(2), 'Play / Pause');
  await expectButtonLabel(buttons.nth(3), 'Next');
}

async function expectButtonLabel(
  locator: import('@playwright/test').Locator,
  label: string
): Promise<void> {
  await locator.waitFor({ state: 'visible' });
  const aria = await locator.getAttribute('aria-label');
  if (aria !== label) {
    throw new Error(`Expected aria-label "${label}", got "${aria}"`);
  }
}

export async function openCardOverlay(page: import('@playwright/test').Page): Promise<void> {
  const card = page.locator('article.card').first();
  await card.getByRole('button', { name: 'Play / Pause' }).click();
  await page.waitForTimeout(400);
  await card.getByRole('button', { name: 'Show video' }).click();
  await page.locator(overlaySelectors.overlay).waitFor({ state: 'visible' });
}

export async function openGlobalOverlay(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('button[title="Play all in list"]').first().click();
  await page.locator(overlaySelectors.globalPlayer).waitFor({ state: 'visible' });
  await page.locator('#global-player-root').getByRole('button', { name: 'Play / Pause' }).click();
  await page.waitForTimeout(500);
  await page.locator('#global-player-root').getByRole('button', { name: 'Show video' }).click();
  await page.locator(overlaySelectors.overlay).waitFor({ state: 'visible' });
}

declare global {
  interface Window {
    __PRR_E2E_WS__?: Workspace;
  }
}
