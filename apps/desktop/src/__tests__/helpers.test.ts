import { describe, expect, it } from 'vitest';
import { resolveSidecarEntry, resolveTsxImport, resolveWebAssetsDir, resolveWebDevServerUrl, resolveWorkspaceRoot } from '../helpers';

describe('desktop helpers', () => {
  it('开发模式下解析源码入口与静态资源目录', () => {
    const sidecar = resolveSidecarEntry('/tmp/apps/desktop/dist', false);
    const web = resolveWebAssetsDir('/tmp/apps/desktop/dist', false);

    expect(sidecar.endsWith('/apps/sidecar/src/index.ts')).toBe(true);
    expect(web.endsWith('/apps/web/out')).toBe(true);
  });

  it('打包模式下解析资源入口', () => {
    const sidecar = resolveSidecarEntry('/tmp/apps/desktop/dist', true);
    const web = resolveWebAssetsDir('/tmp/apps/desktop/dist', true);

    expect(sidecar.endsWith('/sidecar/index.cjs')).toBe(true);
    expect(web.endsWith('/web')).toBe(true);
  });

  it('开发模式下可以解析 workspace 根目录与 tsx import', () => {
    const workspaceRoot = resolveWorkspaceRoot('/Volumes/ai-work/dst-launcher/apps/desktop/dist');
    const tsxImport = resolveTsxImport();

    expect(workspaceRoot).toBe('/Volumes/ai-work/dst-launcher');
    expect(tsxImport.endsWith('/tsx/dist/loader.mjs')).toBe(true);
  });

  it('只在显式配置时返回 dev server 地址', () => {
    process.env.NEXT_DEV_SERVER_URL = 'http://127.0.0.1:3000';
    expect(resolveWebDevServerUrl()).toBe('http://127.0.0.1:3000');
    delete process.env.NEXT_DEV_SERVER_URL;
    expect(resolveWebDevServerUrl()).toBeNull();
  });
});
