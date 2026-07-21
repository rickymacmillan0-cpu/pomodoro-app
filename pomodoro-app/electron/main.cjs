const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null
let isQuitting = false

// ── 创建托盘图标 (16x16 番茄色方块) ──────────────────
function createTrayIcon() {
  // 用 nativeImage 画一个简单的番茄色圆点
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = 6

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= r) {
        // 番茄红 #FF453A
        canvas[idx] = 255     // R
        canvas[idx + 1] = 69  // G
        canvas[idx + 2] = 58  // B
        canvas[idx + 3] = 255 // A
      } else {
        canvas[idx] = 0
        canvas[idx + 1] = 0
        canvas[idx + 2] = 0
        canvas[idx + 3] = 0
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

// ── 创建主窗口 ──────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 540,
    minWidth: 340,
    minHeight: 480,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    title: '番茄钟 · Pomodoro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 关闭窗口时隐藏到托盘（而非退出）
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── 创建系统托盘 ────────────────────────────────────
function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('番茄钟 · Pomodoro')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: '开始 / 暂停',
      click: () => {
        mainWindow?.webContents.send('tray-toggle-timer')
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // 单击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

// ── IPC 处理 ────────────────────────────────────────
ipcMain.on('close-window', () => {
  mainWindow?.hide() // 隐藏到托盘而非关闭
})

ipcMain.on('minimize-window', () => {
  mainWindow?.minimize()
})

ipcMain.on('toggle-always-on-top', (_event, isTop) => {
  mainWindow?.setAlwaysOnTop(isTop)
})

// ── App 生命周期 ────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
})

// 所有窗口关闭时不要退出（因为有托盘）
app.on('window-all-closed', () => {
  // 不退出，保持托盘运行
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  } else {
    mainWindow.show()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})
