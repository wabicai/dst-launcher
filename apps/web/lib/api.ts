import { DstLauncherApiClient } from '@dst-launcher/shared';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.dstLauncher?.apiBaseUrl) {
    return window.dstLauncher.apiBaseUrl;
  }
  return process.env.NEXT_PUBLIC_SIDECAR_URL ?? 'http://127.0.0.1:45991';
}

let client: DstLauncherApiClient | null = null;

export function getApiClient() {
  if (!client) {
    client = new DstLauncherApiClient(getApiBaseUrl());
  }
  return client;
}

export function toWsUrl(path: string) {
  const base = getApiBaseUrl();
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}${path}`;
}
