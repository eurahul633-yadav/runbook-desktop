const Autopass = require('autopass')
const Corestore = require('corestore')
const path = require('path')
const fs = require('fs')
const examples = require('./examples')
const initializationKey = 'runbook:initialization:v1'
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)

class PlaybookStore {
  constructor(root, onUpdate, options = {}) {
    const storage = path.join(root, 'runbook-data')
    fs.mkdirSync(root, { recursive: true })
    this.createdLibrary = false
    try {
      // Exclusive creation is the only evidence of a genuinely new library.
      fs.mkdirSync(storage)
      this.createdLibrary = true
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
    this.corestore = new Corestore(storage)
    this.pass = new Autopass(this.corestore, options)
    this.pass.on('update', onUpdate)
    this.writes = Promise.resolve()
    this.closing = null
    this.initializing = null
  }

  ready() {
    if (!this.initializing) this.initializing = this.initialize()
    return this.initializing
  }

  async initialize() {
    await this.pass.ready()
    const record = await this.pass.get(initializationKey)
    if (!record && !this.createdLibrary) return // Legacy: never infer newness from contents.
    if (record) {
      const marker = JSON.parse(record.value)
      if (marker.version !== 1 || marker.state !== 'pending') return
    } else {
      // Persist intent before writing any samples, so interrupted initialization
      // can resume using stable IDs without replacing records already present.
      await this.pass.add(initializationKey, JSON.stringify({ version: 1, state: 'pending' }))
    }
    await this.seedItems()
    await this.pass.add(initializationKey, JSON.stringify({ version: 1, state: 'complete' }))
  }

  async list() {
    const items = []
    const records = this.pass.list()

    for await (const record of records) {
      // Hyperbee view entries may contain the record under `value`.
      // The Autopass record itself contains the application key and value.
      const candidates = [
        record,
        record && record.value,
        record && record.value && record.value.value
      ]
      let key = null
      let value = null

      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue
        if (typeof candidate.key === 'string' && candidate.key.startsWith('playbook:')) {
          key = candidate.key
          value = candidate.value
          break
        }
        if (
          candidate.key &&
          typeof candidate.key.key === 'string' &&
          candidate.key.key.startsWith('playbook:')
        ) {
          key = candidate.key.key
          value = candidate.value
          break
        }
      }

      if (!key) continue
      // get() returns the documented { value, file } shape, regardless of
      // how the underlying Hyperbee stream wraps its records.
      const stored = await this.pass.get(key)
      if (stored && stored.value !== undefined) value = stored.value
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value)
        } catch (_) {
          continue
        }
      }
      if (
        value &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        Array.isArray(value.steps)
      ) {
        items.push(value)
      }
    }

    return items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  }

  enqueue(operation) {
    if (this.closing) return Promise.reject(new Error('Storage is shutting down'))
    const result = this.writes.then(() => this.ready()).then(operation)
    this.writes = result.catch(() => {})
    return result
  }

  save(input) {
    return this.enqueue(() => this.saveItem(input))
  }

  seed() {
    return this.enqueue(() => this.seedItems())
  }

  async seedItems() {
    let added = 0
    for (const item of examples) {
      if (await this.pass.get('playbook:' + item.id)) continue
      await this.saveItem(item)
      added++
    }
    return { added }
  }

  async saveItem(input) {
    if (!input || typeof input.title !== 'string' || !input.title.trim()) {
      throw new Error('A title is required')
    }
    if (!Array.isArray(input.steps) || !input.steps.length) throw new Error('Add at least one step')
    if (input.id !== undefined && !validId(input.id)) throw new Error('Invalid playbook ID')
    if (input.steps.length > 40) throw new Error('Use at most 40 steps')
    if (
      input.steps.some(
        (step) =>
          !step ||
          typeof step.text !== 'string' ||
          !step.text.trim() ||
          step.text.trim().length > 500
      )
    ) {
      throw new Error('Each step needs text of at most 500 characters')
    }
    if (input.title.trim().length > 120) throw new Error('Title must be at most 120 characters')
    if (
      input.category !== undefined &&
      (typeof input.category !== 'string' || input.category.length > 40)
    ) {
      throw new Error('Invalid category')
    }
    if (
      input.description !== undefined &&
      (typeof input.description !== 'string' || input.description.length > 1000)
    ) {
      throw new Error('Description must be at most 1000 characters')
    }
    const existing = input.id ? await this.pass.get('playbook:' + input.id) : null
    let previous = existing && existing.value
    if (typeof previous === 'string') previous = JSON.parse(previous)
    const now = new Date().toISOString()
    const item = {
      id: input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: input.title.trim().slice(0, 120),
      category: String(input.category || 'General').trim() || 'General',
      description: String(input.description || '').slice(0, 1000),
      steps: input.steps
        .slice(0, 40)
        .map((step, i) => ({
          id: String(step.id || i),
          text: String(step.text || '')
            .trim()
            .slice(0, 500),
          command: String(step.command || '').slice(0, 1000)
        }))
        .filter((step) => step.text),
      createdAt: previous?.createdAt || now,
      updatedAt: now
    }
    if (!item.steps.length) throw new Error('Add at least one valid step')
    await this.pass.add('playbook:' + item.id, JSON.stringify(item))
    return item
  }

  remove(id) {
    return this.enqueue(() => this.removeItem(id))
  }

  async removeItem(id) {
    if (!validId(id)) throw new Error('Invalid playbook ID')
    await this.pass.remove('playbook:' + id)
    return { id }
  }

  close() {
    if (!this.closing) {
      this.closing = this.writes.then(async () => {
        if (this.initializing) await this.initializing.catch(() => {})
        try {
          await this.pass.close()
        } finally {
          await this.corestore.close()
        }
      })
    }
    return this.closing
  }
}

module.exports = PlaybookStore
