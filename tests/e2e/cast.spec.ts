import { test, expect } from '@playwright/test';
import { buildE2EWorkspace, openCardOverlay, seedE2EWorkspace } from './helpers';
import { installMockAirPlay, installMockCastSdk } from './cast-mocks';

test.describe('cast controls in video overlay', () => {
  test('cast buttons sit left of Sequential | Random', async ({ page }) => {
    await seedE2EWorkspace(page, buildE2EWorkspace());
    await openCardOverlay(page);

    const toggles = page.locator('.video-overlay .controls-row-toggles').first();
    const cast = toggles.locator('.video-overlay-cast');
    const segmented = toggles.locator('.segmented');

    await expect(cast).toBeVisible();
    const castBox = await cast.boundingBox();
    const segBox = await segmented.boundingBox();
    expect(castBox && segBox && castBox.x < segBox.x).toBe(true);
  });

  test('F key toggles fullscreen while overlay open', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __e2eFsCalled?: boolean }).__e2eFsCalled = false;
      Element.prototype.requestFullscreen = function () {
        (window as unknown as { __e2eFsCalled?: boolean }).__e2eFsCalled = true;
        return Promise.resolve();
      };
    });
    await seedE2EWorkspace(page, buildE2EWorkspace());
    await openCardOverlay(page);
    await page.keyboard.press('f');
    const called = await page.evaluate(() => (window as unknown as { __e2eFsCalled?: boolean }).__e2eFsCalled);
    expect(called).toBe(true);
  });
});

test.describe('Chromecast with mocked Cast SDK', () => {
  test.beforeEach(async ({ page }) => {
    await installMockCastSdk(page);
    await seedE2EWorkspace(page, buildE2EWorkspace());
  });

  test('shows Casting to Living Room toast', async ({ page }) => {
    await openCardOverlay(page);
    const chromecast = page.locator('.video-overlay-cast button[aria-label="Chromecast"]');
    await expect(chromecast).toBeVisible();
    await chromecast.click();
    await expect(page.locator('.toast').filter({ hasText: 'Living Room' })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('AirPlay with mocked WebKit picker', () => {
  test.beforeEach(async ({ page }) => {
    await installMockAirPlay(page);
    await seedE2EWorkspace(page, buildE2EWorkspace());
  });

  test('AirPlay button shows device picker toast', async ({ page }) => {
    await openCardOverlay(page);
    const airplay = page.locator('.video-overlay-cast button[aria-label="AirPlay"]');
    await expect(airplay).toBeVisible();
    await airplay.click();
    await expect(page.locator('.toast').filter({ hasText: 'AirPlay' })).toBeVisible({ timeout: 5000 });
  });
});
