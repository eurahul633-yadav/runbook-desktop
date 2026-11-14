const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const electron = process.env.RUNBOOK_TEST_EXECUTABLE || require('electron')
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-restart-test-'))
const root = path.join(parent, 'library')
const other = path.join(parent, 'isolated')
const children = new Set()
function launch(phase, storage = root, executable = electron) {
  const env = { ...process.env, RUNBOOK_TEST_PHASE: phase, RUNBOOK_TEST_STORAGE: storage }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.PEAR_DEV_SERVER_URL
  const child = spawn(
    executable,
    executable !== require('electron') ? [] : [path.join(__dirname, 'support/application.cjs')],
    {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
  children.add(child)
  let output = ''
  child.stdout.on('data', (data) => {
    output += data
    process.stdout.write(data)
  })
  child.stderr.on('data', (data) => {
    output += data
    process.stderr.write(data)
  })
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child process timed out')), 40000)
    child.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      children.delete(child)
      if (code !== 0 || signal || output.includes('FAIL:')) {
        reject(new Error('Application failed: ' + output))
      } else {
        resolve(output)
      }
    })
  })
  // The owner may remain open while a same-path secondary is checked.
  exited.catch(() => {})
  return {
    child,
    exited,
    ready: async (marker = 'READY ') => {
      for (let i = 0; i < 350; i++) {
        if (output.includes(marker)) return
        if (child.exitCode !== null) throw new Error('Application exited before ready: ' + output)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error('Application did not become ready: ' + output)
    }
  }
}
;(async () => {
  console.log('Retained isolated test storage: ' + parent)
  await launch('save').exited
  // No delay: Electron must not exit until the Bare worker has released storage.
  for (let i = 0; i < 3; i++) assert.match(await launch('verify').exited, /WORKER_EXIT.*"code":0/)
  await launch('reopen').exited
  const owner = launch('hold')
  await owner.ready()
  const secondary = await launch('secondary').exited
  assert.ok(
    !secondary.includes('READY ') && !secondary.includes('WORKER_EXIT'),
    'Secondary must not open Corestore'
  )
  if (process.platform !== 'win32') {
    const alias = path.join(parent, 'library-alias')
    fs.symlinkSync(root, alias, 'dir')
    assert.ok(
      !(await launch('secondary', alias).exited).includes('READY '),
      'Symlink alias must share the instance lock'
    )
  }
  assert.match(await launch('empty', other).exited, /"count":12/)
  if (process.env.RUNBOOK_TEST_EXECUTABLE) {
    const cross = await launch('secondary', root, require('electron')).exited
    assert.ok(
      !cross.includes('READY ') && !cross.includes('WORKER_EXIT'),
      'Development and packaged apps must share the same-path lock'
    )
  }
  owner.child.stdin.write('quit\n')
  await owner.ready('SHUTDOWN_HELD')
  assert.ok(
    !(await launch('secondary').exited).includes('READY '),
    'Instance lock must remain held during slow shutdown'
  )
  assert.equal(owner.child.exitCode, null, 'Electron must wait for sidecar shutdown')
  owner.child.stdin.end('release\n')
  await owner.exited
  await launch('verify').exited
  const locker = spawn(process.execPath, [path.join(__dirname, 'support/lock.cjs'), root], {
    stdio: ['pipe', 'pipe', 'inherit']
  })
  await new Promise((resolve, reject) => {
    locker.once('error', reject)
    locker.stdout.once('data', resolve)
  })
  const recovery = launch('recover')
  await recovery.ready('RECOVERY_REQUIRED')
  locker.stdin.end('release\n')
  await new Promise((resolve) => locker.once('exit', resolve))
  recovery.child.stdin.end('retry\n')
  await recovery.exited
  const cleared = path.join(parent, 'cleared-library')
  await launch('clear', cleared).exited
  await launch('verify-empty', cleared).exited
  await launch('verify-empty', cleared).exited
  await launch('restore', cleared).exited
  console.log(
    'PASS: persistence over immediate full restarts; clean sidecar exit before Electron; same-path and alias exclusion; concurrent different-path isolation; first-run samples; no automatic reseeding after deleting all samples; manual restoration'
  )
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
  // Quit only children created by this isolated test; retain all test data.
  for (const child of children) child.stdin.end('quit\n')
})
