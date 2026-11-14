// Opt-in investigation driver for the real normal library. Adds one NEW record;
// never seeds, removes, edits, migrates or replaces existing records.
const { app } = require('electron')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const manifest = process.env.RUNBOOK_NORMAL_MANIFEST
const phase = process.env.RUNBOOK_NORMAL_PHASE
if (!app.isPackaged || !manifest || !['save', 'verify'].includes(phase)) {
  throw new Error('Explicit packaged normal-storage verification required')
}
process.argv = [process.argv[0]] // No --storage override; normal updater settings.
let windows = 0
const runtime = require('pear-runtime')
const run = runtime.run
let alive = 0
runtime.run = function (...args) {
  const worker = run.apply(this, args)
  alive++
  console.log(
    'NORMAL_WORKER',
    JSON.stringify({ pid: worker._process.pid, root: args[1][4], updates: args[1][0] })
  )
  worker.once('exit', (code, signal) => {
    alive--
    console.log('NORMAL_WORKER_EXIT', code, signal)
    if (code !== 0 || signal) process.exitCode = 1
  })
  return worker
}
app.on('will-quit', () => {
  if (alive) {
    console.error('FAIL: worker still alive')
    process.exitCode = 1
  }
})
app.on('browser-window-created', (_, win) => {
  const number = windows++
  win.webContents.once('did-finish-load', async () => {
    try {
      const records = await win.webContents.executeJavaScript(`(async()=>{
     const $=id=>document.getElementById(id)
     const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,50))}throw new Error('Startup timeout: '+$('message').textContent)}
     await wait(()=>$('connection').textContent==='Autopass connected')
     const list=()=>new Promise((resolve,reject)=>{
       const id=crypto.randomUUID();const stop=window.bridge.onWorkerIPC('/workers/main.js',data=>{let e;try{e=JSON.parse(new TextDecoder().decode(data))}catch{return}if(e.id!==id)return;clearTimeout(timer);stop();e.ok?resolve(e.data):reject(new Error(e.error))})
       const timer=setTimeout(()=>{stop();reject(new Error('List timeout'))},15000)
       window.bridge.writeWorkerIPC('/workers/main.js',JSON.stringify({id,action:'list'})).catch(reject)
     })
     const before=await list()
     ${
       phase === 'save'
         ? `if(${number}===0){
       $('new').click();document.querySelector('[name=title]').value='Startup persistence verification '+new Date().toISOString()
       document.querySelector('[name=steps]').value='Save without seeding\\nQuit the complete app\\nReopen the same persistent library'
       $('form').requestSubmit();await wait(()=>!$('editor').open);await wait(()=>$('count').textContent===String(before.length+1))
     }`
         : ''
     }
     return {before,after:await list()}
   })()`)
      const sort = (items) => items.slice().sort((a, b) => a.id.localeCompare(b.id))
      if (phase === 'save' && number === 0) {
        assert.equal(records.after.length, records.before.length + 1)
        for (const item of records.before) {
          assert.deepEqual(
            records.after.find((x) => x.id === item.id),
            item
          )
        }
        fs.writeFileSync(manifest, JSON.stringify(sort(records.after)))
      } else assert.deepEqual(sort(records.after), JSON.parse(fs.readFileSync(manifest, 'utf8')))
      console.log(
        'NORMAL_VERIFIED',
        JSON.stringify({
          phase,
          window: number,
          packaged: app.isPackaged,
          userData: app.getPath('userData'),
          records: records.after.length
        })
      )
      if (number === 0) {
        if (phase === 'save') {
          process.stdin.resume()
          await new Promise((resolve) => process.stdin.once('data', resolve))
          process.stdin.pause()
        }
        win.once('closed', () => setTimeout(() => app.emit('activate'), 100))
        win.close()
      } else if (number === 1) {
        // A renderer reload also attaches to the already-running worker.
        win.webContents.once('did-finish-load', async () => {
          try {
            await win.webContents.executeJavaScript(
              `(async()=>{for(let i=0;i<300;i++){if(document.getElementById('connection').textContent==='Autopass connected'&&document.getElementById('count').textContent===${JSON.stringify(String(records.after.length))})return;await new Promise(r=>setTimeout(r,50))}throw new Error('Reload failed')})()`
            )
            console.log('NORMAL_RELOAD_PASS')
            app.quit()
          } catch (err) {
            console.error(err)
            process.exitCode = 1
            app.quit()
          }
        })
        win.webContents.reload()
      }
    } catch (err) {
      console.error('FAIL:', err)
      process.exitCode = 1
      app.quit()
    }
  })
})
setTimeout(() => {
  console.error('FAIL: normal verification timeout')
  process.exitCode = 1
  app.quit()
}, 45000).unref()
require('../../electron/main')
