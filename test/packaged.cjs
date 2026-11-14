// macOS packaged lifecycle check. Instrument only a fresh copy of the build.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
if (process.platform !== 'darwin') {
  throw new Error('This packaged executable harness currently supports macOS only')
}
const source = path.resolve('out', `Runbook-darwin-${process.arch}`, 'Runbook.app')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-packaged-test-'))
const copy = path.join(root, 'Runbook.app')
fs.cpSync(source, copy, { recursive: true, verbatimSymlinks: true })
const resources = path.join(copy, 'Contents/Resources/app')
const file = path.join(resources, 'package.json')
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
pkg.main = 'test/support/application.cjs'
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
// Use the current harness; do not change production main/worker/renderer files.
fs.copyFileSync(
  path.join(__dirname, 'support/application.cjs'),
  path.join(resources, 'test/support/application.cjs')
)
const env = { ...process.env, RUNBOOK_TEST_EXECUTABLE: path.join(copy, 'Contents/MacOS/Runbook') }
delete env.RUNBOOK_TEST_MAIN
console.log('Retained instrumented packaged copy: ' + root)
const child = spawn(process.execPath, [path.join(__dirname, 'restart.cjs')], {
  env,
  stdio: 'inherit'
})
child.on('error', (err) => {
  console.error(err)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : code
})
