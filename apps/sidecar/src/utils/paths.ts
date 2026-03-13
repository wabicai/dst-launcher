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
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`无效的 slug: ${slug}`);
  }
  const root = path.resolve(instancesDir, slug);
  if (!root.startsWith(path.resolve(instancesDir) + path.sep)) {
    throw new Error(`路径逃逸: ${slug}`);
  }
  const nativeServerDir = path.join(root, 'ds_server');
  return {
    root,
    configDir: path.join(root, 'config', 'rendered'),
    composeDir: path.join(root, 'compose'),
    composeFile: path.join(root, 'compose', 'docker-compose.yml'),
    dataDir: path.join(root, 'data'),
    clusterDir: path.join(root, 'data', 'cluster'),
    serverDir: path.join(root, 'data', 'server'),
    backupsDir: path.join(root, 'backups'),
    steamcmdDir: path.join(root, 'steamcmd'),
    nativeServerDir,
    nativeBinary: path.join(
      nativeServerDir,
      'dontstarve_dedicated_server_nullrenderer.app',
      'Contents',
      'MacOS',
      'dontstarve_dedicated_server_nullrenderer',
    ),
  };
}
