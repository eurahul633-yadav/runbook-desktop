const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const os = require('os')
const path = require('path')
const fs = require('fs')
const storageRoot = require('./storage')
const PearRuntime = require('pear-runtime')
const FramedStream = require('framed-stream')

const { isMac, isLinux, isWindows } = require('which-runtime')
const { command, flag } = require('paparam')
const pkg = require('../package.json')
const { name, productName, version, upgrade } = pkg

const protocol = name
const mainWorkerSpecifier = '/workers/main.js'

const workers = new Map()
const workerExits = new Map()
const workerStates = new Map()
let starting = null
let quitting = false
let shutdown = null

const appName = productName ?? name

const cmd = command(
  appName,
  flag('--storage <dir>', 'pass custom storage to pear-runtime'),
  flag('--no-updates', 'start without OTA updates'),
  flag('--no-sandbox', 'start without Chromium sandbox').hide()
)

cmd.parse(app.isPackaged ? process.argv.slice(1) : process.argv.slice(2))

const pearStore = cmd.flags.storage
const updates = cmd.flags.updates

const root = storageRoot({
  platform: process.platform,
  home: os.homedir(),
  env: process.env,
  name: appName,
  explicit: pearStore
})
fs.mkdirSync(root, { recursive: true })
// Canonicalize aliases so --storage symlinks share the same instance lock.
const storage = fs.realpathSync(root)
app.setPath('userData', storage)
const startupLog = path.join(storage, 'runbook-startup.log')
function logStartup(event, detail = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    pid: process.pid,
    event,
    ...detail
  })
  console.log(line)
  try {
    fs.appendFileSync(startupLog, line + '\n')
  } catch (err) {
    console.error('Unable to write startup log:', err.message)
  }
}
logStartup('launch', {
  packaged: app.isPackaged,
  userData: app.getPath('userData'),
  storage,
  playbooks: path.join(storage, 'runbook-data'),
  updater: path.join(storage, 'pear-runtime', 'corestore')
})

app.on('before-quit', (event) => {
  quitting = true
  if (!workers.size) return
  event.preventDefault()
  if (shutdown) return
  // Keep Electron's single-instance lock until every sidecar has actually exited.
  const warning = setTimeout(() => {
    dialog
      .showMessageBox({
        type: 'warning',
        title: 'Runbook is still closing',
        message:
          'Storage cleanup is taking longer than expected. Runbook will wait for the worker to exit so another instance cannot open the same library. Do not force quit while a save is pending.',
        buttons: ['Keep waiting']
      })
      .catch(console.error)
  }, 15000)
  shutdown = Promise.all(Array.from(workerExits.values())).then(() => {
    clearTimeout(warning)
    app.quit()
  })
  for (const pipe of workers.values()) pipe.write('runbook:shutdown')
})

ipcMain.on('pkg', (evt) => {
  evt.returnValue = pkg
})

function getAppPath() {
  if (!app.isPackaged) return null
  if (isLinux && process.env.APPIMAGE) return process.env.APPIMAGE
  if (isWindows) return process.execPath
  return path.join(process.resourcesPath, '..', '..')
}

function sendToAll(name, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(name, data)
  }
}

function shouldUpdate() {
  if (!updates) return false

  if (isWindows) {
    const isMsix = process.windowsStore ?? false
    if (isMsix) {
      return app.isPackaged
    }
    return false
  }

  if (isMac) {
    if (process.mas) {
      return false
    }
    return app.isPackaged
  }

  // TODO: Linux Snap and Flatpak should not update.
  return app.isPackaged
}

function getWorker(specifier) {
  if (workers.has(specifier)) {
    logStartup('reuse-worker')
    return workers.get(specifier)
  }
  if (quitting) throw new Error('Runbook is shutting down')
  if (specifier !== mainWorkerSpecifier) throw new Error('Unknown worker')
  workerStates.set(specifier, { status: 'starting' })
  logStartup('start-worker')
  const appPath = getAppPath()

  const extension = isLinux ? '.AppImage' : isMac ? '.app' : '.msix'

  const worker = PearRuntime.run(require.resolve('..' + specifier), [
    shouldUpdate(),
    version,
    upgrade,
    productName + extension,
    storage,
    appPath
  ])
  const pipe = new FramedStream(worker)
  pipe.on('error', (err) => {
    workerStates.set(specifier, { status: 'error', error: err.message })
    logStartup('ipc-error', { error: err.message })
    console.error('Worker IPC failed:', err)
    sendToAll(
      'pear:worker:ipc:' + specifier,
      Buffer.from(JSON.stringify({ type: 'startup-error', error: err.message }))
    )
  })

  function sendWorkerStdout(data) {
    sendToAll('pear:worker:stdout:' + specifier, data)
  }
  function sendWorkerStderr(data) {
    logStartup('worker-stderr', { error: data.toString().slice(-4000) })
    sendToAll('pear:worker:stderr:' + specifier, data)
  }
  function sendWorkerIPC(data) {
    try {
      const event = JSON.parse(data.toString())
      if (event.type === 'ready' || event.type === 'startup-error') {
        workerStates.set(specifier, {
          status: event.type === 'ready' ? 'ready' : 'error',
          error: event.error
        })
        logStartup(event.type, { error: event.error })
      }
    } catch (_) {
      /* OTA messages are plain strings. */
    }
    sendToAll('pear:worker:ipc:' + specifier, data)
  }
  ipcMain.handle('pear:worker:writeIPC:' + specifier, (evt, data) => {
    if (quitting) throw new Error('Runbook is shutting down')
    return pipe.write(data)
  })
  workers.set(specifier, pipe)
  pipe.on('data', sendWorkerIPC)
  worker.stdout.on('data', sendWorkerStdout)
  worker.stderr.on('data', sendWorkerStderr)
  let resolveExit
  workerExits.set(
    specifier,
    new Promise((resolve) => {
      resolveExit = resolve
    })
  )
  worker.once('exit', (code, signal) => {
    logStartup('worker-exit', { code, signal })
    const previous = workerStates.get(specifier)
    workerStates.set(specifier, {
      status: 'stopped',
      error: previous?.error || `Storage worker exited (${code}${signal ? ', ' + signal : ''})`
    })
    ipcMain.removeHandler('pear:worker:writeIPC:' + specifier)
    pipe.removeListener('data', sendWorkerIPC)
    worker.stdout.removeListener('data', sendWorkerStdout)
    worker.stderr.removeListener('data', sendWorkerStderr)
    sendToAll('pear:worker:exit:' + specifier, code)
    workers.delete(specifier)
    workerExits.delete(specifier)
    resolveExit()
  })
  return pipe
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: appName,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  const devServerUrl = process.env.PEAR_DEV_SERVER_URL

  if (devServerUrl) {
    await win.loadURL(devServerUrl)
    win.webContents.openDevTools()
    return
  }

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

ipcMain.handle('pear:applyUpdate', () => {
  const pipe = getWorker(mainWorkerSpecifier)

  return new Promise((resolve, reject) => {
    function onData(data) {
      const message = data.toString()

      if (message === 'pear:updateApplied') {
        pipe.removeListener('data', onData)
        resolve()
      }
    }

    pipe.on('data', onData)
    pipe.write('pear:applyUpdate')
  })
})
ipcMain.handle('pear:startWorker', async (evt, filename, retry = false) => {
  if (filename !== mainWorkerSpecifier) throw new Error('Unknown worker')
  if (quitting) throw new Error('Runbook is shutting down')
  if (starting) return starting
  starting = (async () => {
    if (retry && workers.has(filename)) {
      logStartup('retry-storage')
      const exited = workerExits.get(filename)
      workers.get(filename).write('runbook:shutdown')
      let timer
      try {
        await Promise.race([
          exited,
          new Promise((resolve, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    'Previous storage worker is still closing. Wait and retry; no second worker was started.'
                  )
                ),
              12000
            )
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    }
    getWorker(filename)
    return { ...workerStates.get(filename), storage, logPath: startupLog }
  })()
  try {
    return await starting
  } finally {
    starting = null
  }
})
ipcMain.handle('app:afterUpdate', () => {
  if (isLinux && process.env.APPIMAGE) {
    app.relaunch({
      execPath: process.env.APPIMAGE,
      args: [
        '--appimage-extract-and-run',
        ...process.argv.slice(1).filter((arg) => arg !== '--appimage-extract-and-run')
      ]
    })
  } else if (!isWindows) {
    app.relaunch()
  }
  app.quit()
})

function handleDeepLink(url) {
  console.log('deep link:', url)
}

app.setAsDefaultProtocolClient(protocol)

app.on('open-url', (evt, url) => {
  evt.preventDefault()
  handleDeepLink(url)
})

const lock = app.requestSingleInstanceLock()

if (!lock) {
  logStartup('secondary-instance-blocked')
  app.quit()
} else {
  app.on('second-instance', (evt, args) => {
    const url = args.find((arg) => arg.startsWith(protocol + '://'))
    if (url) handleDeepLink(url)
    if (!quitting) {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    }
  })

  app.whenReady().then(() => {
    if (quitting) return
    createWindow().catch((err) => {
      console.error('Failed to create window:', err)
      app.quit()
    })

    app.on('activate', () => {
      if (!quitting && BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((err) => {
          console.error('Failed to create window:', err)
        })
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
