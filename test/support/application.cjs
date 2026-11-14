// Test-only driver: always requires an explicit test storage path.
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = process.env.RUNBOOK_TEST_STORAGE
const phase = process.env.RUNBOOK_TEST_PHASE
if (
  !root ||
  ![
    'save',
    'verify',
    'empty',
    'hold',
    'secondary',
    'reopen',
    'recover',
    'clear',
    'verify-empty',
    'restore'
  ].includes(phase)
) {
  throw new Error('Explicit test storage and phase are required')
}
app.name = 'Runbook'
process.argv = [
  process.argv[0],
  ...(app.isPackaged ? [] : [__filename]),
  '--storage',
  root,
  '--no-updates'
]
const runtime = require('pear-runtime')
const originalRun = runtime.run
let running = 0
let cleanExits = 0
let releaseShutdown = null
let windows = 0
runtime.run = function (...args) {
  const worker = originalRun.apply(this, args)
  worker.stdout.on('data', (data) => console.log('WORKER_STDOUT ' + data.toString()))
  worker.stderr.on('data', (data) => console.error('WORKER_STDERR ' + data.toString()))
  if (phase === 'hold') {
    const write = worker._write
    worker._write = function (data, callback) {
      if (Buffer.from(data.chunk).toString().includes('runbook:shutdown')) {
        releaseShutdown = () => write.call(this, data, callback)
        console.log('SHUTDOWN_HELD')
      } else write.call(this, data, callback)
    }
  }
  running++
  worker.once('exit', (code, signal) => {
    running--
    if (code === 0 && !signal) cleanExits++
    console.log('WORKER_EXIT ' + JSON.stringify({ code, signal }))
  })
  return worker
}
app.on('will-quit', () => {
  if (running || (phase !== 'secondary' && cleanExits !== (phase === 'recover' ? 2 : 1))) {
    console.error('FAIL: Electron quit before a clean worker exit')
    process.exitCode = 1
  }
})
const watchdog = setTimeout(() => {
  console.error('FAIL: Application test timed out')
  app.exit(1)
}, 35000)
watchdog.unref()
app.on('browser-window-created', (_, win) => {
  const windowNumber = windows++
  if (phase === 'secondary') {
    console.error('FAIL: Same-path secondary opened a window')
    app.exit(1)
    return
  }
  win.webContents.on('console-message', (_event, ...args) => {
    const message = typeof args[0] === 'object' ? args[0].message : args[1]
    if (message === 'RECOVERY_REQUIRED') {
      console.log(message)
      process.stdin.once('data', () =>
        win.webContents.executeJavaScript('window.runbookTestRetry()')
      )
    }
  })
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const phase = ${JSON.stringify(phase)}
        const $ = id => document.getElementById(id)
        const wait = async fn => { for(let i=0;i<500;i++){if(fn()) return;await new Promise(r=>setTimeout(r,50))}throw new Error('Timeout: '+fn+'; '+$('message').textContent) }
        if(phase==='recover') {
          await wait(()=>!$('retry-storage').hidden && !$('retry-storage').disabled)
          if($('library').textContent.includes('Loading playbooks'))throw new Error('Failure left infinite loading')
          console.log('RECOVERY_REQUIRED')
          await new Promise(resolve=>{window.runbookTestRetry=resolve})
          $('retry-storage').click()
        }
        await wait(()=>$('connection').textContent==='Autopass connected')
        await wait(()=>!document.querySelector('.empty')?.textContent.includes('Loading'))
        if(phase==='clear') {
          if($('count').textContent!=='12')throw new Error('Expected fresh samples before deletion')
          for(let i=0;i<12;i++) {
            document.querySelector('.tile').click()
            document.querySelector('.detail-actions .danger').click()
            await wait(()=>$('confirm-delete').open)
            $('delete-accept').click()
            await wait(()=>$('count').textContent===String(11-i) && $('detail').hidden)
          }
          return {count:0}
        }
        if(phase==='verify-empty' || phase==='restore') {
          if($('count').textContent!=='0')throw new Error('Deleted examples were automatically reseeded')
          if(phase==='restore') {
            $('seed').click();await wait(()=>!$('seed').disabled && $('count').textContent==='12')
            return {count:12}
          }
          return {count:0}
        }
        if(phase==='save') {
          if($('count').textContent!=='12')throw new Error('Expected twelve first-run examples')
          $('new').click()
          document.querySelector('[name=title]').value='Restart regression'
          document.querySelector('[name=steps]').value='Save a record\\nRestart the application'
          $('form').requestSubmit()
          await wait(()=>!$('editor').open && $('count').textContent==='13')
        }
        if(phase==='empty' && $('count').textContent!=='12')throw new Error('Storage isolation failed')
        if(['save','verify','hold','reopen','recover'].includes(phase)) {
          if($('count').textContent!=='13')throw new Error('Record missing after restart')
          const card=[...document.querySelectorAll('.tile')].find(el=>el.querySelector('h3').textContent==='Restart regression')
          if(!card)throw new Error('User record not visible after restart')
          const id=card.dataset.id
          card.click()
          const steps=[...document.querySelectorAll('.step span')].map(x=>x.textContent)
          if(steps.join('|')!=='Save a record|Restart the application')throw new Error('Persisted steps differ')
          return {id,title:document.querySelector('.detail-top h2').textContent,steps}
        }
        return {count:12}
      })()`)
      const manifest = path.join(root, 'restart-expected.json')
      if (phase === 'save') fs.writeFileSync(manifest, JSON.stringify(result))
      if (
        ['verify', 'hold', 'reopen', 'recover'].includes(phase) &&
        JSON.stringify(result) !== fs.readFileSync(manifest, 'utf8')
      ) {
        throw new Error('Persisted content differs')
      }
      if (app.getPath('userData') !== fs.realpathSync(root)) {
        throw new Error('Electron userData is not the explicit canonical root')
      }
      console.log(
        'READY ' +
          JSON.stringify({
            phase,
            isPackaged: app.isPackaged,
            userData: app.getPath('userData'),
            result
          })
      )
      if (phase === 'reopen' && windowNumber === 0) {
        win.once('closed', () => setTimeout(() => app.emit('activate'), 100))
        win.close()
        return
      }
      if (phase === 'hold') {
        process.stdin.resume()
        process.stdin.once('data', () => {
          process.stdin.once('data', () => releaseShutdown())
          app.quit()
        })
      } else app.quit()
    } catch (err) {
      console.error(err)
      app.exit(1)
    }
  })
})
require(process.env.RUNBOOK_TEST_MAIN || '../../electron/main')
