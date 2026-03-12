import path from 'node:path';

export function resolveWebDevServerUrl() {
  const url = process.env.NEXT_DEV_SERVER_URL?.trim();
  return url ? url : null;
}

export function resolveWorkspaceRoot(baseDir: string) {
  return path.resolve(baseDir, '../../../');
}

export function resolveTsxImport() {
  return require.resolve('tsx');
}

function resolveResourcesPath(baseDir: string) {
  return process.resourcesPath ?? path.resolve(baseDir, '..');
}

export function resolveSidecarEntry(baseDir: string, packaged: boolean) {
  if (packaged) {
    return path.join(resolveResourcesPath(baseDir), 'sidecar', 'index.cjs');
  }
  return path.resolve(baseDir, '../../sidecar/src/index.ts');
}

export function resolveWebAssetsDir(baseDir: string, packaged: boolean) {
  if (packaged) {
    return path.join(resolveResourcesPath(baseDir), 'web');
  }
  return path.resolve(baseDir, '../../web/out');
}
