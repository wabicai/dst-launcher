import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { _electron as electron } from '@playwright/test';

const ROOT_DIR = '/Volumes/ai-work/dst-launcher';
const DESKTOP_DIST_DIR = path.join(ROOT_DIR, 'apps/desktop/dist');
const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dst-launcher-desktop-smoke-'));

const appBinary = await findPackagedBinary(DESKTOP_DIST_DIR);
if (!appBinary) {
  await fs.rm(tempHome, { recursive: true, force: true });
  throw new Error('未找到打包后的 DST Launcher.app，请先执行 `pnpm dist`。');
}

let app;
try {
  app = await electron.launch({
    executablePath: appBinary,
    env: {
      ...process.env,
      HOME: tempHome,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  const renderState = await page.evaluate(async () => {
    const stylesheetHref = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((node) => node.href)
      .find(Boolean) ?? null;

    let stylesheetOk = false;
    if (stylesheetHref) {
      try {
        const response = await fetch(stylesheetHref);
        stylesheetOk = response.ok;
      } catch {
        stylesheetOk = false;
      }
    }

    return {
      title: document.title,
      href: window.location.href,
      backgroundImage: getComputedStyle(document.body).backgroundImage,
      stylesheetHref,
      stylesheetOk,
    };
  });

  if (!renderState.href.startsWith('http://127.0.0.1:')) {
    throw new Error(`桌面窗口未通过内置静态服务加载：${renderState.href}`);
  }

  if (renderState.backgroundImage === 'none') {
    throw new Error('桌面页面样式未生效，body 背景仍为 none。');
  }

  if (!renderState.stylesheetHref || !renderState.stylesheetOk) {
    throw new Error(`桌面页面样式资源不可达：${renderState.stylesheetHref ?? 'missing'}`);
  }

  console.log(`desktop smoke passed: ${renderState.title} -> ${renderState.href}`);
} finally {
  await app?.close();
  await fs.rm(tempHome, { recursive: true, force: true });
}

async function findPackagedBinary(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const appDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
    .map((entry) => path.join(rootDir, entry.name));

  if (appDirs.length > 0) {
    return path.join(appDirs[0], 'Contents', 'MacOS', 'DST Launcher');
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nestedDir = path.join(rootDir, entry.name);
    const nestedBinary = await findPackagedBinary(nestedDir);
    if (nestedBinary) {
      return nestedBinary;
    }
  }

  return null;
}
