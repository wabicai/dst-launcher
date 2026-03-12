import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DESKTOP_APP_NAME = 'DST Launcher';
export const DESKTOP_APP_SLUG = 'dst-launcher';

export interface DesktopAppPaths {
  applicationSupportDir: string;
  legacyUserDataDir: string;
  userDataDir: string;
  logsDir: string;
}

export interface DesktopAppLike {
  setName(name: string): void;
  setPath(name: string, value: string): void;
  setAppLogsPath?(value?: string): void;
}

export function resolveDesktopAppPaths(homeDir = os.homedir()): DesktopAppPaths {
  const applicationSupportDir = path.join(homeDir, 'Library', 'Application Support');
  const userDataDir = path.join(applicationSupportDir, DESKTOP_APP_NAME);

  return {
    applicationSupportDir,
    legacyUserDataDir: path.join(applicationSupportDir, '@dst-launcher', 'desktop'),
    userDataDir,
    logsDir: path.join(userDataDir, 'logs'),
  };
}

export function migrateLegacyUserData(paths: DesktopAppPaths, logger: Pick<Console, 'info' | 'warn'> = console) {
  const nextExists = fs.existsSync(paths.userDataDir);
  const legacyExists = fs.existsSync(paths.legacyUserDataDir);

  fs.mkdirSync(path.dirname(paths.userDataDir), { recursive: true });

  if (!nextExists && legacyExists) {
    fs.renameSync(paths.legacyUserDataDir, paths.userDataDir);
    cleanupLegacyParent(paths.legacyUserDataDir);
    logger.info(`已迁移旧 userData 目录到 ${paths.userDataDir}`);
  } else if (nextExists && legacyExists) {
    logger.warn(`检测到旧目录 ${paths.legacyUserDataDir} 与新目录 ${paths.userDataDir} 同时存在，优先使用新目录。`);
  }

  fs.mkdirSync(paths.userDataDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });
}

export function applyDesktopAppIdentity(appLike: DesktopAppLike, homeDir = os.homedir(), logger: Pick<Console, 'info' | 'warn'> = console) {
  const paths = resolveDesktopAppPaths(homeDir);

  appLike.setName(DESKTOP_APP_NAME);
  migrateLegacyUserData(paths, logger);
  appLike.setPath('userData', paths.userDataDir);
  appLike.setAppLogsPath?.(paths.logsDir);

  return paths;
}

function cleanupLegacyParent(legacyUserDataDir: string) {
  const legacyRoot = path.dirname(legacyUserDataDir);
  try {
    if (fs.existsSync(legacyRoot) && fs.readdirSync(legacyRoot).length === 0) {
      fs.rmdirSync(legacyRoot);
    }
  } catch {
    // 忽略旧目录清理失败
  }
}
