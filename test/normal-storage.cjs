// Explicitly opt in: npm run test:normal-storage. Uses actual persistent storage.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path')
const { spawn } = require('node:child_process')
if (process.platform !== 'darwin') throw new Error('macOS packaged verification only')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-normal-verification-'))
const copy = path.join(root, 'Runbook.app')
fs.cpSync(path.resolve('out', `Runbook-darwin-${process.arch}`, 'Runbook.app'), copy, {
  recursive: true,
  verbatimSymlinks: true
})
const resources = path.join(copy, 'Contents/Resources/app')
fs.copyFileSync(
  path.join(__dirname, 'support/normal.cjs'),
  path.join(resources, 'test/support/normal.cjs')
)
const file = path.join(resources, 'package.json'),
  pkg = JSON.parse(fs.readFileSync(file))
pkg.main = 'test/support/normal.cjs'
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
const manifest = path.join(root, 'records.json')
console.log('Retained normal-storage verification artifacts: ' + root)
async function launch(phase) {
  const env = { ...process.env, RUNBOOK_NORMAL_PHASE: phase, RUNBOOK_NORMAL_MANIFEST: manifest }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'PEAR_DEV_SERVER_URL',
    'RUNBOOK_TEST_MAIN',
    'RUNBOOK_TEST_STORAGE'
  ]) {
    delete env[key]
  }
  const child = spawn(path.join(copy, 'Contents/MacOS/Runbook'), [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let output = ''
  let checkingDevelopment = false
  for (const pipe of [child.stdout, child.stderr]) {
    pipe.on('data', (data) => {
      output += data
      process.stdout.write(data)
      if (phase === 'save' && !checkingDevelopment && output.includes('NORMAL_VERIFIED')) {
        checkingDevelopment = true
        const probeEnv = { ...env }
        delete probeEnv.RUNBOOK_NORMAL_PHASE
        delete probeEnv.RUNBOOK_NORMAL_MANIFEST
        const probe = spawn(
          require('electron'),
          [path.join(__dirname, 'support/normal-secondary.cjs')],
          { env: probeEnv, stdio: ['ignore', 'pipe', 'pipe'] }
        )
        let result = ''
        for (const stream of [probe.stdout, probe.stderr]) {
          stream.on('data', (chunk) => {
            result += chunk
            process.stdout.write(chunk)
          })
        }
        probe.once('exit', (code) => {
          if (
            code !== 0 ||
            !result.includes('secondary-instance-blocked') ||
            !result.includes('NORMAL_DEV_ROOT')
          ) {
            output += 'FAIL: development/default packaged root exclusion'
          }
          child.stdin.end('continue\n')
        })
      }
    })
  }
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      code === 0 && !signal && !output.includes('FAIL:') && output.includes('NORMAL_RELOAD_PASS')
        ? resolve()
        : reject(new Error('Normal application verification failed'))
    })
  })
}
;(async () => {
  await launch('save')
  for (let i = 0; i < 3; i++) await launch('verify')
  console.log(
    'PASS: normal persistent library retained over three consecutive packaged restarts, window reopen and renderer reload; no seeding or existing record changes'
  )
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
