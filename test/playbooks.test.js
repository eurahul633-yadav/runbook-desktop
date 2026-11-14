const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const PlaybookStore = require('../workers/playbooks')

test('Autopass validation, identities, optional seeding and persistence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runbook-test-'))
  await fs.mkdir(path.join(root, 'runbook-data')) // Legacy library: no first-run import.
  let store = new PlaybookStore(root, () => {}, { replicate: false })
  try {
    await store.ready()
    assert.deepEqual(await store.list(), [])
    const input = { title: 'Same title', steps: [{ text: 'Inspect logs' }] }
    const first = await store.save(input)
    const second = await store.save(input)
    assert.notEqual(first.id, second.id)
    for (const id of ['', '../bad', {}, 123, 'x'.repeat(101)]) {
      await assert.rejects(store.save({ ...input, id }), /Invalid playbook ID/)
      await assert.rejects(store.remove(id), /Invalid playbook ID/)
    }
    for (const value of [
      null,
      {},
      { ...input, title: ' ' },
      { ...input, steps: [] },
      { ...input, steps: [null] },
      { ...input, steps: [{ text: ' ' }] },
      { ...input, description: {} },
      { ...input, category: {} }
    ]) {
      await assert.rejects(store.save(value))
    }
    const edited = await store.save({
      ...input,
      id: first.id,
      title: 'Edited',
      createdAt: 'forged'
    })
    assert.equal(edited.createdAt, first.createdAt)
    assert.equal((await store.list()).length, 2)
    const imports = await Promise.all([store.seed(), store.seed()])
    assert.equal(imports[0].added, 12)
    assert.equal(imports[1].added, 0)
    const example = (await store.list()).find((item) => item.id.startsWith('example-'))
    await store.save({ ...example, title: 'Custom example' })
    assert.equal((await store.seed()).added, 0)
    assert.equal(
      (await store.list()).find((item) => item.id === example.id).title,
      'Custom example'
    )
    await store.remove(example.id)
    assert.equal((await store.seed()).added, 1)
    await store.remove(second.id)
    await store.close()
    store = new PlaybookStore(root, () => {}, { replicate: false })
    await store.ready()
    const restored = await store.list()
    assert.equal(restored.length, 13)
    assert.ok(!restored.some((item) => item.id === second.id))
    assert.equal((await store.seed()).added, 0)
  } finally {
    await store.close()
    // Retain isolated test storage for inspection; never remove existing libraries.
    console.log('Retained test storage: ' + root)
  }
})

test('close drains accepted saves, rejects late writes and releases Corestore', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runbook-drain-test-'))
  await fs.mkdir(path.join(root, 'runbook-data')) // Exercise draining an existing library.
  const store = new PlaybookStore(root, () => {}, { replicate: false })
  await store.ready()
  const first = store.save({ title: 'Accepted first', steps: [{ text: 'Inspect logs' }] })
  const invalid = store.save({ title: '', steps: [] })
  const second = store.save({ title: 'Accepted second', steps: [{ text: 'Verify recovery' }] })
  const closed = store.close()
  assert.equal(store.close(), closed)
  await assert.rejects(
    store.save({ title: 'Too late', steps: [{ text: 'No write' }] }),
    /shutting down/
  )
  await assert.rejects(invalid, /title/)
  await Promise.all([first, second, closed])
  const reopened = new PlaybookStore(root, () => {}, { replicate: false })
  try {
    await reopened.ready()
    assert.deepEqual((await reopened.list()).map((item) => item.title).sort(), [
      'Accepted first',
      'Accepted second'
    ])
  } finally {
    await reopened.close()
  }
  console.log('Retained drain test storage: ' + root)
})
