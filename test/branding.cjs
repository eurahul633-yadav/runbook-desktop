// Read-only branding check: no save, seed or delete requests, isolated storage.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
if (process.versions.electron) {
  const { app } = require('electron')
  const root = process.env.RUNBOOK_BRANDING_STORAGE
  if (!root) throw new Error('Explicit isolated test storage required')
  process.argv = [
    process.argv[0],
    ...(app.isPackaged ? [] : [__filename]),
    '--storage',
    root,
    '--no-updates'
  ]
  app.on('browser-window-created', (_, win) => {
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const image = document.querySelector('img.brand-mark')
          if (!image) throw new Error('Sidebar is not an image')
          await image.decode()
          for (let attempt = 0; attempt < 300; attempt++) {
            if (document.getElementById('connection').textContent === 'Autopass connected' && !document.getElementById('library').textContent.includes('Loading playbooks')) break
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          if (document.getElementById('connection').textContent !== 'Autopass connected') throw new Error('Storage did not finish initializing before screenshot')
          const bounds = image.getBoundingClientRect()
          const brand = document.querySelector('.brand')
          return { src: image.getAttribute('src'), width: bounds.width, height: bounds.height,
            naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            gap: getComputedStyle(brand).gap, padding: getComputedStyle(brand).padding,
            title: brand.querySelector('strong').textContent, subtitle: brand.querySelector('small').textContent }
        })()`)
        assert.deepEqual(result, {
          src: '../build/icon.png',
          width: 39,
          height: 39,
          naturalWidth: 1024,
          naturalHeight: 1024,
          gap: '12px',
          padding: '4px 9px',
          title: 'Runbook',
          subtitle: 'Developer playbooks'
        })
        const screenshot = await win.webContents.capturePage()
        fs.writeFileSync(process.env.RUNBOOK_BRANDING_SCREENSHOT, screenshot.toPNG())
        console.log(
          'PASS: sidebar branding',
          JSON.stringify({ packaged: app.isPackaged, ...result })
        )
        app.quit()
      } catch (err) {
        console.error(err)
        process.exitCode = 1
        app.quit()
      }
    })
  })
  setTimeout(() => {
    console.error('Branding check timed out')
    app.exit(1)
  }, 30000).unref()
  require('../electron/main')
} else {
  const { spawn } = require('node:child_process')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-branding-'))
  const source = path.resolve('out', `Runbook-darwin-${process.arch}`, 'Runbook.app')
  const copy = path.join(root, 'Runbook.app')
  async function launch(executable, args, label) {
    const env = {
      ...process.env,
      RUNBOOK_BRANDING_STORAGE: path.join(root, label + '-storage'),
      RUNBOOK_BRANDING_SCREENSHOT: path.join(root, label + '.png')
    }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.PEAR_DEV_SERVER_URL
    const child = spawn(executable, args, { env, stdio: 'inherit' })
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) =>
        code === 0 && !signal ? resolve() : reject(new Error(label + ' branding check failed'))
      )
    })
  }
  ;(async () => {
    console.log('Retained branding screenshots and isolated storage: ' + root)
    await launch(require('electron'), [__filename], 'development')
    fs.cpSync(source, copy, { recursive: true, verbatimSymlinks: true })
    const resources = path.join(copy, 'Contents/Resources/app')
    const file = path.join(resources, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
    pkg.main = 'test/branding.cjs'
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
    await launch(path.join(copy, 'Contents/MacOS/Runbook'), [], 'packaged')
  })().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
