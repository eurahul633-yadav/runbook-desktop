// https://github.com/holepunchto/hello-pear-worker v1.2.0

const PearRuntime = require('pear-runtime') // pear-runtime on desktop; pear-mobile on mobile
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const path = require('bare-path')
const dir = require('bare-storage')
const { isBareKit } = require('which-runtime')
const PlaybookStore = require('./playbooks')

// mobile doesn't have the executable path (argv[0])
// and the worker entry path (argv[1]) in the workers argv‘s
// ... to reuse the same worker in all platforms this logic is needed
const argv = (index) => Bare.argv[index + (isBareKit ? 0 : 2)]

const updaterConfig = {
  updates: argv(0) !== 'false',
  version: argv(1),
  upgrade: argv(2),
  name: argv(3),
  dir: argv(4) || dir.persistent(), // argv[4] is undefined in mobile
  app: argv(5) // argv[5] is undefined in mobile
}

const pipe = new FramedStream(Bare.IPC)
const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime', 'corestore'))
const swarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm, store })
const playbooks = new PlaybookStore(updaterConfig.dir, () =>
  pipe.write(JSON.stringify({ type: 'changed' }))
)
playbooks
  .ready()
  .then(() => pipe.write(JSON.stringify({ type: 'ready' })))
  .catch((err) => pipe.write(JSON.stringify({ type: 'startup-error', error: err.message })))

pear.updater.on('error', (err) => pipe.write('updater-error ' + err.message))

if (updaterConfig.updates !== false) {
  swarm.on('connection', (connection) => store.replicate(connection))
  swarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

// An append on the app's drive doesn't check for an update straight away: the
// updater defers it by a random delay of up to an hour (see PearRuntimeUpdater)
// so that a released fleet doesn't hit the seeder all at once. Forward the
// delay so the app can say it is waiting rather than look inert — without it,
// a staged update is indistinguishable from a broken updater for up to an hour.
pear.updater.on('update-scheduled', (delay) => pipe.write('update-scheduled ' + delay))
pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))
pear.on('minver-required', () => pipe.write('minver-required')) // for mobile store update notification

let closing = false
let cleanup = null
const active = new Set()

function closeResources() {
  if (!cleanup) {
    closing = true
    cleanup = (async () => {
      await Promise.allSettled(Array.from(active))
      // Attempt every close even if one resource reports an error.
      const errors = []
      for (const close of [
        () => playbooks.close(),
        () => swarm.destroy(),
        () => pear.close(),
        () => store.close()
      ]) {
        try {
          await close()
        } catch (err) {
          errors.push(err.message)
        }
      }
      if (errors.length) throw new Error(errors.join('; '))
    })()
  }
  return cleanup
}

goodbye(closeResources)
// Also release resources if the parent disappears without a shutdown request.
pipe.on('error', (err) => {
  console.error('Worker IPC failed:', err.message)
  goodbye.exit()
})
pipe.on('close', () => goodbye.exit())

async function handleMessage(data) {
  const message = data.toString()
  if (message === 'runbook:shutdown') {
    closeResources()
      .then(() => {
        pipe.once('finish', () => goodbye.exit())
        pipe.end('runbook:shutdownComplete')
      })
      .catch((err) => pipe.write(JSON.stringify({ type: 'shutdown-error', error: err.message })))
    return
  }
  if (closing) {
    if (message.startsWith('{')) {
      try {
        const request = JSON.parse(message)
        pipe.write(
          JSON.stringify({
            type: 'response',
            id: request.id,
            ok: false,
            error: 'Storage is shutting down'
          })
        )
      } catch (_) {
        /* Ignore malformed requests during shutdown. */
      }
    }
    return
  }
  if (message.startsWith('{')) {
    let request
    try {
      request = JSON.parse(message)
    } catch (_) {
      return
    }
    try {
      await playbooks.ready()
      let data
      if (request.action === 'status') data = { ready: true }
      else if (request.action === 'list') data = await playbooks.list()
      else if (request.action === 'seed') data = await playbooks.seed()
      else if (request.action === 'save') data = await playbooks.save(request.payload)
      else if (request.action === 'remove') data = await playbooks.remove(request.payload.id)
      else throw new Error('Unknown action')
      pipe.write(JSON.stringify({ type: 'response', id: request.id, ok: true, data }))
    } catch (err) {
      pipe.write(
        JSON.stringify({ type: 'response', id: request.id, ok: false, error: err.message })
      )
    }
    return
  }
  if (message !== 'pear:applyUpdate') {
    pipe.write('unknown-message ' + message)
    return
  }

  try {
    await pear.ready()
    await pear.updater.applyUpdate()
    pipe.write('pear:updateApplied')
  } catch (err) {
    pipe.write('pear:updateFailed ' + err.message)
  }
}

pipe.on('data', (data) => {
  const task = handleMessage(data)
  active.add(task)
  task
    .catch((err) => pipe.write(JSON.stringify({ type: 'startup-error', error: err.message })))
    .finally(() => active.delete(task))
})

pipe.write('Hello from worker')
