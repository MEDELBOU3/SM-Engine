// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Basic Info
    platform: process.platform,
    
    // File System Access (Native Dialogs)
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    saveFile: (content, filename) => ipcRenderer.invoke('file:save', content, filename),
    readProjectTextFile: (relativePath) => ipcRenderer.invoke('project:readTextFile', relativePath),
    
    // Window Controls
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    
    // Developer
    openDevTools: () => ipcRenderer.send('dev:open')
});
