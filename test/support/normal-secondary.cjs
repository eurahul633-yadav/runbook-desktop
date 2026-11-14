// Read-only default-path lock probe while the packaged app owns the normal root.
const { app } = require('electron')
app.name = 'Runbook'
process.argv = [process.argv[0], __filename]
app.on('browser-window-created', () => {
  console.error('FAIL: development opened the packaged library concurrently')
  app.exit(1)
})
app.on('will-quit', () => console.log('NORMAL_DEV_ROOT', app.getPath('userData')))
require('../../electron/main')
