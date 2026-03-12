import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStaticWebServer } from '../static-server';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('static web server', () => {
  it('可以提供根页面、子路由和绝对路径 CSS 资源', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-launcher-static-web-'));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, '_next', 'static', 'css'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'projects'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><head><link rel="stylesheet" href="/_next/static/css/app.css"></head><body>home</body></html>');
    fs.writeFileSync(path.join(rootDir, 'projects', 'new.html'), '<html><body>new-project</body></html>');
    fs.writeFileSync(path.join(rootDir, '_next', 'static', 'css', 'app.css'), 'body { background: rgb(10, 13, 24); }');

    const server = await createStaticWebServer(rootDir);
    try {
      const homeResponse = await fetch(`${server.origin}/`);
      const homeHtml = await homeResponse.text();
      expect(homeResponse.ok).toBe(true);
      expect(homeHtml).toContain('/_next/static/css/app.css');

      const pageResponse = await fetch(`${server.origin}/projects/new?via=test`);
      expect(pageResponse.ok).toBe(true);
      expect(await pageResponse.text()).toContain('new-project');

      const cssResponse = await fetch(`${server.origin}/_next/static/css/app.css`);
      expect(cssResponse.ok).toBe(true);
      expect(await cssResponse.text()).toContain('background');
    } finally {
      await server.close();
    }
  });
});
