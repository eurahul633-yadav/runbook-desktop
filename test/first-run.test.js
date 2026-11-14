const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Store = require('../workers/playbooks')
const Corestore = require('corestore')
const Autopass = require('autopass')
const examples = require('../workers/examples')
const markerKey = 'runbook:initialization:v1'
const open = (root) => new Store(root, () => {}, { replicate: false })
const fresh = () => fs.mkdtemp(path.join(os.tmpdir(), 'runbook-first-run-test-'))

test('first-run examples and marker persist; deletion never triggers automatic reseeding', async () => {
  const root = await fresh()
  let store = open(root)
  try {
    await Promise.all([store.ready(), store.ready()])
    const original = await store.list()
    assert.equal(original.length, 12)
    assert.equal(new Set(original.map((item) => item.id)).size, 12)
    assert.deepEqual(original.map((item) => item.id).sort(), examples.map((item) => item.id).sort())
    assert.ok(original.every((item) => !item.title.includes('Startup persistence verification')))
    assert.deepEqual(JSON.parse((await store.pass.get(markerKey)).value), {
      version: 1,
      state: 'complete'
    })
    assert.equal((await store.seed()).added, 0)
    await store.close()
    store = open(root)
    await store.ready()
    assert.deepEqual(await store.list(), original)
    const saved = await store.save({
      title: 'Reviewer guide',
      steps: [{ text: 'Inspect recovery status' }]
    })
    await store.close()
    store = open(root)
    await store.ready()
    assert.deepEqual(
      (await store.list()).find((item) => item.id === saved.id),
      saved
    )
    for (const item of await store.list()) await store.remove(item.id)
    await store.close()
    store = open(root)
    await store.ready()
    assert.deepEqual(await store.list(), [])
    assert.equal(JSON.parse((await store.pass.get(markerKey)).value).state, 'complete')
    await store.close()
    store = open(root)
    await store.ready()
    assert.deepEqual(await store.list(), [])
    assert.equal((await store.seed()).added, 12)
    assert.equal((await store.seed()).added, 0)
  } finally {
    await store.close()
  }
})

test('unmarked legacy stores, including empty directories, receive no automatic writes', async () => {
  for (const populated of [false, true]) {
    const root = await fresh()
    const corestore = new Corestore(path.join(root, 'runbook-data'))
    const pass = new Autopass(corestore, { replicate: false })
    await pass.ready()
    if (populated) {
      await pass.add(
        'playbook:legacy',
        JSON.stringify({
          id: 'legacy',
          title: 'Existing guide',
          category: 'General',
          steps: [{ text: 'Keep unchanged' }]
        })
      )
    }
    const length = pass.base.local.length
    await pass.close()
    await corestore.close()
    const store = open(root)
    try {
      await store.ready()
      assert.equal(store.pass.base.local.length, length)
      assert.equal(await store.pass.get(markerKey), null)
      assert.equal((await store.list()).length, populated ? 1 : 0)
    } finally {
      await store.close()
    }
  }
  const root = await fresh()
  await fs.mkdir(path.join(root, 'runbook-data'))
  const store = open(root)
  try {
    await store.ready()
    assert.equal(await store.pass.get(markerKey), null)
    assert.deepEqual(await store.list(), [])
  } finally {
    await store.close()
  }
})

test('interrupted first-run import resumes with stable IDs and preserves existing sample edits', async () => {
  const root = await fresh()
  const corestore = new Corestore(path.join(root, 'runbook-data'))
  const pass = new Autopass(corestore, { replicate: false })
  await pass.ready()
  await pass.add(markerKey, JSON.stringify({ version: 1, state: 'pending' }))
  const edited = { ...examples[0], title: 'Retain this edit', createdAt: '2020-01-01' }
  await pass.add('playbook:' + edited.id, JSON.stringify(edited))
  await pass.close()
  await corestore.close()
  const store = open(root)
  try {
    await store.ready()
    assert.equal((await store.list()).length, 12)
    assert.deepEqual(
      (await store.list()).find((item) => item.id === edited.id),
      edited
    )
    assert.equal(JSON.parse((await store.pass.get(markerKey)).value).state, 'complete')
  } finally {
    await store.close()
  }
})
