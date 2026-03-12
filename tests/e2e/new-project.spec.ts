import { expect, test } from '@playwright/test';

test('新建项目主流程可重复执行', async ({ page }) => {
  await page.goto('/projects/new');

  const projectNameInput = page.getByTestId('project-name-input');
  const projectSlugInput = page.getByTestId('project-slug-input');
  const targetModeSelect = page.getByTestId('target-mode-select');
  const submitButton = page.getByTestId('project-submit-button');
  const clusterPreview = page.getByTestId('preview-cluster-ini');

  await projectNameInput.fill('Fireside Alpha Base');
  await expect(projectSlugInput).toHaveValue('fireside-alpha-base');
  await expect(clusterPreview).toContainText('cluster_name = Fireside Alpha Base');

  await targetModeSelect.selectOption('ssh');
  const remotePathInput = page.getByTestId('remote-path-input');
  await expect(remotePathInput).toHaveValue('~/dst-launcher/fireside-alpha-base');

  await projectNameInput.fill('Fireside Bravo Camp');
  await expect(projectSlugInput).toHaveValue('fireside-bravo-camp');
  await expect(remotePathInput).toHaveValue('~/dst-launcher/fireside-bravo-camp');
  await expect(clusterPreview).toContainText('cluster_name = Fireside Bravo Camp');

  await page.getByRole('tab', { name: 'Cluster' }).click();
  const clusterNameInput = page.getByTestId('cluster-name-input');
  await expect(clusterNameInput).toHaveValue('Fireside Bravo Camp');

  await clusterNameInput.fill('My Custom Cluster');
  await expect(clusterPreview).toContainText('cluster_name = My Custom Cluster');

  await page.getByRole('tab', { name: 'Target' }).click();
  await projectNameInput.fill('Fireside Charlie Camp');
  await expect(projectSlugInput).toHaveValue('fireside-charlie-camp');
  await expect(remotePathInput).toHaveValue('~/dst-launcher/fireside-charlie-camp');

  await page.getByRole('tab', { name: 'Cluster' }).click();
  await expect(page.getByTestId('cluster-name-input')).toHaveValue('My Custom Cluster');
  await expect(clusterPreview).toContainText('cluster_name = My Custom Cluster');

  await page.getByRole('tab', { name: 'Target' }).click();
  await targetModeSelect.selectOption('local');
  await expect(page.getByTestId('remote-path-input')).toHaveCount(0);

  await submitButton.click();
  await page.waitForURL(/\/project\?id=/);

  await expect(page.getByTestId('workspace-project-name')).toHaveText('Fireside Charlie Camp');
  await expect(page.getByTestId('workspace-project-meta')).toContainText('`fireside-charlie-camp`');
  await expect(page.getByTestId('workspace-project-meta')).toContainText('本地 Docker');
  await expect(page.getByTestId('workspace-actions')).toBeVisible();
  await expect(page.getByTestId('workspace-network-panel')).toBeVisible();
  await expect(page.getByTestId('workspace-network-status')).toContainText('本地模式无需额外开放 VPS UDP 端口');
  await expect(page.getByTestId('action-deploy-button')).toBeVisible();
  await expect(page.getByTestId('action-start-button')).toBeVisible();
  await expect(page.getByTestId('action-stop-button')).toBeVisible();
  await expect(page.getByTestId('action-restart-button')).toBeVisible();
  await expect(page.getByTestId('action-backup-button')).toBeVisible();
  await expect(page.getByTestId('action-check-ports-button')).toBeVisible();
});
