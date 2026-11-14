// Hold only an explicitly selected, test-created library; never reset storage.
const Store = require('../../workers/playbooks')
const store = new Store(process.argv[2], () => {}, { replicate: false })
store
  .ready()
  .then(() => {
    console.log('LOCKED')
    process.stdin.once('data', async () => {
      await store.close()
      process.stdin.pause()
    })
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
