import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1440, height: 960, label: 'desktop' },
  { width: 1280, height: 800, label: 'compact' },
] as const;

test.describe.serial('视觉回归', () => {
  for (const viewport of viewports) {
    test(`首页、创建页、工作区在 ${viewport.label} 视口下保持稳定`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const projectName = `Visual ${viewport.label} Camp`;

      await page.goto('/projects/new');
      await page.getByTestId('project-name-input').fill(projectName);
      await expect(page).toHaveScreenshot(`create-${viewport.label}.png`, {
        animations: 'disabled',
        fullPage: true,
        maxDiffPixels: 200,
      });

      await page.getByTestId('project-submit-button').click();
      await page.waitForURL(/\/project\?id=/);
      await expect(page).toHaveScreenshot(`workspace-${viewport.label}.png`, {
        animations: 'disabled',
        fullPage: true,
        maxDiffPixels: 200,
      });

      await page.goto('/');
      await expect(page).toHaveScreenshot(`home-${viewport.label}.png`, {
        animations: 'disabled',
        fullPage: true,
        mask: [
          page.locator('[data-visual-dynamic="summary"]'),
          page.locator('[data-visual-dynamic="project-list"]'),
        ],
        maxDiffPixels: 200,
      });
    });
  }
});
