import os from 'node:os';
import path from 'node:path';

export interface AppPaths {
  appDataDir: string;
  dbFile: string;
  instancesDir: string;
}

export function resolveAppPaths(customAppDataDir?: string): AppPaths {
  const appDataDir =
    customAppDataDir?.trim() ||
    path.join(os.homedir(), 'Library', 'Application Support', 'DST Launcher');

  return {
    appDataDir,
    dbFile: path.join(appDataDir, 'db', 'dst-launcher.sqlite'),
    instancesDir: path.join(appDataDir, 'instances'),
  };
}

export function resolveInstancePaths(instancesDir: string, slug: string) {
  const root = path.join(instancesDir, slug);
  return {
    root,
    configDir: path.join(root, 'config', 'rendered'),
    composeDir: path.join(root, 'compose'),
    composeFile: path.join(root, 'compose', 'docker-compose.yml'),
    dataDir: path.join(root, 'data'),
    clusterDir: path.join(root, 'data', 'cluster'),
    serverDir: path.join(root, 'data', 'server'),
    backupsDir: path.join(root, 'backups'),
  };
}
