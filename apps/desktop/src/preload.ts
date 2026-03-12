import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dstLauncher', ipcRenderer.sendSync('app:bootstrap'));
