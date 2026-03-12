declare global {
  interface Window {
    dstLauncher?: {
      apiBaseUrl?: string;
      platform?: string;
      appDataPath?: string;
    };
  }
}

export {};
