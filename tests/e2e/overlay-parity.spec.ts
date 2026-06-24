import { test, expect } from '@playwright/test';
import {
  buildE2EWorkspace,
  controlOrder,
  openCardOverlay,
  openGlobalOverlay,
  overlaySelectors,
  seedE2EWorkspace,
} from './helpers';

test.describe('video overlay parity — card vs global player', () => {
  test.beforeEach(async ({ page }) => {
    await seedE2EWorkspace(page, buildE2EWorkspace());
    await page.locator('article.card').first().waitFor({ state: 'visible' });
  });

  test('card: show video opens overlay, not queue', async ({ page }) => {
    await openCardOverlay(page);

    await expect(page.locator(overlaySelectors.overlay)).toBeVisible();
    await expect(page.locator(overlaySelectors.playerMount)).toBeVisible();
    await expect(page.locator(overlaySelectors.stage)).toBeVisible();
    await expect(page.locator(overlaySelectors.playlistSidebar)).toHaveCount(0);

    await page.locator('.video-overlay').getByRole('button', { name: 'Queue panel' }).click();
    await expect(page.locator(overlaySelectors.playlistSidebar)).toBeVisible();
    await expect(page.locator(overlaySelectors.overlay)).toBeVisible();
  });

  test('global: show video opens overlay, not queue', async ({ page }) => {
    await openGlobalOverlay(page);

    await expect(page.locator(overlaySelectors.overlay)).toBeVisible();
    await expect(page.locator(overlaySelectors.playerMount)).toBeVisible();
    await expect(page.locator(overlaySelectors.playlistSidebar)).toHaveCount(0);

    await page.locator('.video-overlay').getByRole('button', { name: 'Queue panel' }).click();
    await expect(page.locator(overlaySelectors.playlistSidebar)).toBeVisible();
    await expect(page.locator(overlaySelectors.overlay)).toBeVisible();
  });

  test('card and global share main control order (search before previous)', async ({ page }) => {
    await controlOrder(page, 'article.card');

    await page.locator('button[title="Play all in list"]').first().click();
    await page.locator(overlaySelectors.globalPlayer).waitFor({ state: 'visible' });
    await controlOrder(page, '#global-player-root');
  });

  test('Esc closes card overlay while playback continues', async ({ page }) => {
    await openCardOverlay(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(overlaySelectors.overlay)).toHaveCount(0);
    await expect(page.locator('article.card').first().getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('Esc closes global overlay while playback continues', async ({ page }) => {
    await openGlobalOverlay(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(overlaySelectors.overlay)).toHaveCount(0);
    await expect(page.locator('#global-player-root').getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('double-click player mount requests fullscreen', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __e2eFsCalled?: boolean }).__e2eFsCalled = false;
      Element.prototype.requestFullscreen = function () {
        (window as unknown as { __e2eFsCalled?: boolean }).__e2eFsCalled = true;
        return Promise.resolve();
      };
    });
    await seedE2EWorkspace(page, buildE2EWorkspace());
    await page.locator('article.card').first().waitFor({ state: 'visible' });

    await openCardOverlay(page);
    await page.evaluate(() => {
      const el = document.querySelector('.player-mount-overlay');
      el?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    const called = await page.evaluate(() => (window as unknown as { __e2eFsCalled?: boolean }).__e2eFsCalled);
    expect(called).toBe(true);
  });

  test('overlay exposes cast controls row', async ({ page }) => {
    await openCardOverlay(page);
    await expect(page.locator('.video-overlay-cast')).toBeVisible();
  });
});
