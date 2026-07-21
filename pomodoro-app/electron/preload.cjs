const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  toggleAlwaysOnTop: (isTop) => ipcRenderer.send('toggle-always-on-top', isTop),

  // 监听托盘菜单的「开始/暂停」
  onTrayToggle: (callback) => {
    ipcRenderer.on('tray-toggle-timer', () => callback())
  },
})
