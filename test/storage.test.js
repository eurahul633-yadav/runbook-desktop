const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const storageRoot = require('../electron/storage')

test('normal development and packaged launches select the original persistent roots', () => {
  const base = { home: '/home/person', name: 'Runbook', env: {} }
  for (const isPackaged of [false, true]) {
    assert.equal(
      storageRoot({ ...base, platform: 'darwin', isPackaged }),
      path.join(base.home, 'Library', 'Application Support', 'Runbook')
    )
    assert.equal(
      storageRoot({ ...base, platform: 'win32', isPackaged }),
      path.join(base.home, 'AppData', 'Local', 'Runbook')
    )
    assert.equal(
      storageRoot({ ...base, platform: 'linux', isPackaged }),
      path.join(base.home, '.config', 'Runbook')
    )
  }
  assert.equal(
    storageRoot({ ...base, platform: 'linux', env: { XDG_CONFIG_HOME: '/custom/config' } }),
    path.join('/custom/config', 'Runbook')
  )
  assert.equal(
    storageRoot({ ...base, platform: 'linux', env: { SNAP_USER_COMMON: '/snap/storage' } }),
    path.join('/snap/storage', 'Runbook')
  )
  assert.equal(
    storageRoot({ ...base, explicit: './isolated-library' }),
    path.resolve('./isolated-library')
  )
})
