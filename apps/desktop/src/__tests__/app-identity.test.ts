import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDesktopAppIdentity, DESKTOP_APP_NAME, resolveDesktopAppPaths } from '../app-identity';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('desktop app identity', () => {
  it('解析统一后的 userData 路径', () => {
    const paths = resolveDesktopAppPaths('/tmp/test-home');

    expect(paths.userDataDir).toBe('/tmp/test-home/Library/Application Support/DST Launcher');
    expect(paths.legacyUserDataDir).toBe('/tmp/test-home/Library/Application Support/@dst-launcher/desktop');
  });

  it('会迁移旧 userData 目录并应用到 app', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-launcher-desktop-'));
    tempDirs.push(homeDir);
    const paths = resolveDesktopAppPaths(homeDir);
    fs.mkdirSync(paths.legacyUserDataDir, { recursive: true });
    fs.writeFileSync(path.join(paths.legacyUserDataDir, 'legacy.txt'), 'ok');

    const setName = vi.fn();
    const setPath = vi.fn();
    const setAppLogsPath = vi.fn();
    const info = vi.fn();
    const warn = vi.fn();

    const appliedPaths = applyDesktopAppIdentity(
      { setName, setPath, setAppLogsPath },
      homeDir,
      { info, warn },
    );

    expect(setName).toHaveBeenCalledWith(DESKTOP_APP_NAME);
    expect(setPath).toHaveBeenCalledWith('userData', paths.userDataDir);
    expect(setAppLogsPath).toHaveBeenCalledWith(paths.logsDir);
    expect(fs.existsSync(path.join(paths.userDataDir, 'legacy.txt'))).toBe(true);
    expect(fs.existsSync(paths.legacyUserDataDir)).toBe(false);
    expect(appliedPaths.userDataDir).toBe(paths.userDataDir);
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('新旧目录同时存在时优先使用新目录', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-launcher-desktop-'));
    tempDirs.push(homeDir);
    const paths = resolveDesktopAppPaths(homeDir);
    fs.mkdirSync(paths.legacyUserDataDir, { recursive: true });
    fs.mkdirSync(paths.userDataDir, { recursive: true });

    const warn = vi.fn();

    applyDesktopAppIdentity(
      {
        setName: vi.fn(),
        setPath: vi.fn(),
      },
      homeDir,
      { info: vi.fn(), warn },
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(paths.legacyUserDataDir)).toBe(true);
    expect(fs.existsSync(paths.userDataDir)).toBe(true);
  });
});
