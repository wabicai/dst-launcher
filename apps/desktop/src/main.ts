import path from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { app, BrowserWindow, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { applyDesktopAppIdentity, DESKTOP_APP_NAME } from './app-identity';
import { resolveSidecarEntry, resolveTsxImport, resolveWebAssetsDir, resolveWebDevServerUrl, resolveWorkspaceRoot } from './helpers';
import { createStaticWebServer, type StaticWebServer } from './static-server';

let sidecarProcess: ChildProcess | null = null;
let staticWebServer: StaticWebServer | null = null;
let apiBaseUrl = '';

applyDesktopAppIdentity(app);

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1220,
    minHeight: 860,
    backgroundColor: '#0a0d18',
    title: DESKTOP_APP_NAME,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) {
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      { role: 'cut', label: '剪切', enabled: params.isEditable },
      { role: 'copy', label: '复制', enabled: !!params.selectionText || params.isEditable },
      { role: 'paste', label: '粘贴', enabled: params.isEditable },
      { role: 'selectAll', label: '全选' },
    ]);

    contextMenu.popup({ window });
  });

  const entry = await resolveRendererEntry();
  await window.loadURL(entry);

  if (resolveWebDevServerUrl() && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return window;
}


async function resolveRendererEntry() {
  const devServerUrl = resolveWebDevServerUrl();
  if (devServerUrl) {
    return devServerUrl;
  }

  if (!staticWebServer) {
    staticWebServer = await createStaticWebServer(resolveWebAssetsDir(__dirname, app.isPackaged));
  }

  return staticWebServer.origin;
}

async function startSidecar() {
  const packaged = app.isPackaged;
  const sidecarEntry = resolveSidecarEntry(__dirname, packaged);
  const execArgv = packaged ? [] : ['--import', resolveTsxImport()];
  const cwd = packaged ? path.dirname(sidecarEntry) : resolveWorkspaceRoot(__dirname);

  sidecarProcess = fork(sidecarEntry, ['--port', '0', '--app-data', app.getPath('userData')], {
    cwd,
    execArgv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      APP_PACKAGED: packaged ? '1' : '',
    },
  });

  sidecarProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[sidecar] ${chunk.toString()}`);
  });
  sidecarProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[sidecar] ${chunk.toString()}`);
  });

  apiBaseUrl = await waitForSidecarAddress(sidecarProcess);
  await waitForHealthy(apiBaseUrl);
}

function registerBootstrapIpc() {
  ipcMain.on('app:bootstrap', (event) => {
    event.returnValue = {
      apiBaseUrl,
      platform: process.platform,
      appDataPath: app.getPath('userData'),
    };
  });
}

async function bootstrap() {
  await app.whenReady();
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenuTemplate()));
  registerBootstrapIpc();
  await startSidecar();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  sidecarProcess?.kill();
  if (staticWebServer) {
    void staticWebServer.close();
    staticWebServer = null;
  }
});

void bootstrap().catch((error) => {
  console.error(error);
  app.quit();
});

async function waitForHealthy(baseUrl: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // 等待 sidecar 启动
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('sidecar 健康检查超时');
}

async function waitForSidecarAddress(child: ChildProcess) {
  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('sidecar 地址解析超时'));
    }, 15_000);

    const handleStdout = (chunk: Buffer | string) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (!match) {
        return;
      }

      clearTimeout(timeout);
      child.stdout?.off('data', handleStdout);
      child.off('exit', handleExit);
      resolve(match[0]);
    };

    const handleExit = (code: number | null) => {
      clearTimeout(timeout);
      child.stdout?.off('data', handleStdout);
      reject(new Error(`sidecar 提前退出，exit code: ${code ?? 'unknown'}`));
    };

    child.stdout?.on('data', handleStdout);
    child.once('exit', handleExit);
  });
}

function buildApplicationMenuTemplate(): MenuItemConstructorOptions[] {
  const fileSubmenu: MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [{ role: 'close', label: '关闭窗口' }]
    : [{ role: 'quit', label: '退出 DST Launcher' }];

  const fileMenu: MenuItemConstructorOptions = {
    label: '文件',
    submenu: fileSubmenu,
  };

  const editMenu: MenuItemConstructorOptions = {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
      { role: 'delete', label: '删除' },
      { role: 'selectAll', label: '全选' },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'togglefullscreen', label: '切换全屏' },
      { type: 'separator' },
      { role: 'toggleDevTools', label: '开发者工具' },
    ],
  };

  const windowSubmenu: MenuItemConstructorOptions[] = [
    { role: 'minimize', label: '最小化' },
    { role: 'zoom', label: '缩放' },
  ];

  if (process.platform === 'darwin') {
    windowSubmenu.push({ type: 'separator' }, { role: 'front', label: '前置全部窗口' });
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: windowSubmenu,
  };

  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === 'darwin') {
    template.push({
      label: DESKTOP_APP_NAME,
      submenu: [
        { role: 'about', label: `关于 ${DESKTOP_APP_NAME}` },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${DESKTOP_APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${DESKTOP_APP_NAME}` },
      ],
    });
  }

  template.push(fileMenu, editMenu, viewMenu, windowMenu);
  return template;
}
