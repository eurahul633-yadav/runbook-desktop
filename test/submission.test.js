const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { packagerConfig } = require('../forge.config')

test('submission packaging excludes local artifacts without excluding Bare dependencies', () => {
  for (const file of [
    '/AGENTS.md',
    '/AGENTS.override.md',
    '/nested/.agents/settings.json',
    '/nested/.local-tooling/session.json',
    '/nested/.tooling/state.json',
    '/nested/.private/config.json',
    '/nested/.local/settings.json',
    '/config/settings.local.json',
    '/config/editor.local.toml',
    '/agent_docs/architecture.md',
    '/.env.local',
    '/config/.env',
    '/config/.env.production',
    '/config/.npmrc',
    '/config/.netrc',
    '/config/credentials.json',
    '/config/.aws/credentials',
    '/keys/id_ed25519',
    '/build/signing/certificate.p12',
    '/nested/runbook-data/CORESTORE',
    '/nested/pear-runtime/corestore/CORESTORE',
    '/nested/logs/runbook-startup.log',
    '/nested/runbook-branding-123/packaged.png',
    '/nested/runbook-normal-verification-123/records.json',
    '/nested/runbook-restart-test-123/library/CORESTORE',
    '/nested/cache.tmp',
    '/nested/tmp/diagnostic.json',
    '/nested/temp/session',
    '/.aws/credentials',
    '/runbook-data/CORESTORE',
    '/out/Runbook.app',
    '/.codex/config.toml'
  ]) {
    assert.ok(
      packagerConfig.ignore.some((pattern) => pattern.test(file)),
      file
    )
  }
  for (const file of [
    '/node_modules/pear-runtime/index.js',
    '/node_modules/autopass/index.js',
    '/node_modules/pear-runtime-updater/index.js',
    '/node_modules/pear-runtime/node_modules/helper/dist/index.js',
    '/node_modules/bare-fs/index.js',
    '/node_modules/helper/tmp/runtime.js',
    '/workers/examples.js',
    '/workers/main.js',
    '/build/icon.icns',
    '/renderer/app.js'
  ]) {
    assert.ok(!packagerConfig.ignore.some((pattern) => pattern.test(file)), file)
  }
})

test('Runbook native icon formats and PNG resolutions are valid', () => {
  const root = path.resolve(__dirname, '..')
  const icns = fs.readFileSync(path.join(root, 'build/icon.icns'))
  assert.equal(icns.toString('ascii', 0, 4), 'icns')
  assert.equal(icns.readUInt32BE(4), icns.length)
  const ico = fs.readFileSync(path.join(root, 'build/icon.ico'))
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 6)
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const file = size === 1024 ? 'build/icon.png' : `build/icon/icon-${size}x${size}.png`
    const png = fs.readFileSync(path.join(root, file))
    assert.equal(png.toString('ascii', 1, 4), 'PNG')
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
  assert.equal(path.resolve(packagerConfig.icon), path.join(root, 'build/icon'))
})

test('source ignore patterns cover local branding artifacts and default release metadata claims no identity or license', () => {
  const ignore = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8').split('\n')
  for (const rule of [
    '.local/',
    '.private/',
    '.tooling/',
    '.local-tooling/',
    '*.local.*',
    '.agents/',
    '.codex/',
    'AGENTS*.md',
    'agent_docs/',
    'runbook-branding-*/',
    'runbook-normal-verification-*/',
    '.env',
    '.env.*',
    '.netrc',
    'credentials.json',
    '*.log'
  ]) {
    assert.ok(ignore.includes(rule), rule)
  }
  assert.ok(!packagerConfig.extendInfo?.ElectronTeamID)
  const config = require('../forge.config')
  const snap = config.makers.find((maker) => maker.name === 'pear-electron-forge-maker-snap')
  assert.equal(snap.config.snapcraft.license, undefined)
})
