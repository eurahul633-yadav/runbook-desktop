// Runs the real renderer, preload, IPC and Bare worker against fresh test storage.
const { app } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-ui-'))
process.argv = [process.argv[0], __filename, '--storage', root, '--no-updates']
let finished = false
app.on('browser-window-created', (_, win) => {
  const errors = []
  win.webContents.on('console-message', (_event, ...args) => {
    const message = typeof args[0] === 'object' ? args[0].message : args[1]
    if (/Content Security Policy|Insecure Content-Security-Policy|Worker:/.test(message || '')) {
      errors.push(message)
    }
  })
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const $ = id => document.getElementById(id)
        const wait = async predicate => { for (let i=0;i<300;i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 50)) } throw new Error('Timed out: '+predicate) }
        const check = (value, message) => { if (!value) throw new Error(message) }
        const tiles = () => [...document.querySelectorAll('.tile')]
        await wait(() => $('connection').textContent === 'Autopass connected')
        await wait(() => $('count').textContent === '12')
        check(tiles().length === 6, 'First run automatically shows bundled examples')
        check(tiles().length === 6, 'First page has six tiles')
        check($('previous').disabled && !$('next').disabled, 'First page controls')
        const first = tiles().map(x => x.textContent).join('|')
        $('next').click()
        check(tiles().length === 6 && $('next').disabled && !$('previous').disabled, 'Second page controls')
        check(first !== tiles().map(x => x.textContent).join('|'), 'Pages differ')
        const title = tiles()[0].querySelector('h3').textContent
        tiles()[0].click()
        check(!$('detail').hidden && $('pagination').hidden, 'Detail navigation')
        check(document.activeElement === $('detail'), 'Detail receives keyboard focus')
        document.querySelector('.step input').click()
        check(document.querySelector('progress').value === 1, 'Checklist progress')
        document.querySelector('.back').click()
        check($('page-status').textContent.startsWith('Page 2'), 'Back preserves page')
        check(document.activeElement.querySelector('h3').textContent === title, 'Back restores focus')
        $('search').value = 'certificate'; $('search').dispatchEvent(new Event('input'))
        check(tiles().length === 1 && $('page-status').textContent.startsWith('Page 1 of 1'), 'Search before pagination')
        $('filter').value = 'Frontend'; $('filter').dispatchEvent(new Event('change'))
        check(tiles().length === 0 && $('pagination').hidden, 'Combined filters empty state')
        $('search').value = ''; $('search').dispatchEvent(new Event('input'))
        check(tiles().length === 3, 'Category before pagination')
        $('all').click()
        $('seed').click(); await wait(() => !$('seed').disabled)
        check($('count').textContent === '12' && $('message').textContent.startsWith('0 example'), 'Repeated seed is idempotent')
        $('new').click()
        document.querySelector('[name=title]').value = ' '
        document.querySelector('[name=steps]').value = ' '
        $('form').requestSubmit()
        await wait(() => $('form-error').textContent.length > 0)
        check($('editor').open && $('count').textContent === '12', 'Validation error stays in dialog without saving')
        document.querySelector('[name=title]').value = 'UI multiline test'
        document.querySelector('[name=steps]').value = 'First step\\nSecond step'
        $('form').requestSubmit()
        await wait(() => !$('editor').open && $('count').textContent === '13')
        $('search').value = 'UI multiline'; $('search').dispatchEvent(new Event('input'))
        tiles()[0].click()
        check(document.querySelectorAll('.step').length === 2, 'Multiline form steps')
        document.querySelector('.detail-actions .danger').click()
        await wait(() => $('confirm-delete').open)
        $('delete-cancel').click()
        check(!$('detail').hidden, 'Cancel preserves playbook')
        document.querySelector('.detail-actions .danger').click()
        await wait(() => $('confirm-delete').open)
        $('delete-accept').click()
        await wait(() => $('count').textContent === '12' && $('detail').hidden)
        check(tiles().length === 0, 'Deletion updates filtered empty state')
        $('all').click(); $('next').click()
        for (let i=0;i<6;i++) {
          tiles()[0].click(); document.querySelector('.detail-actions .danger').click()
          await wait(() => $('confirm-delete').open); $('delete-accept').click()
          await wait(() => $('detail').hidden && $('count').textContent === String(11-i))
        }
        check(tiles().length === 6 && $('page-status').textContent.startsWith('Page 1 of 1'), 'Deleting last page clamps page')
        return 'PASS: real Electron/Bare UI navigation, seeding, search, filters, focus, multiline creation, progress, deletion and page clamping'
      })()`)
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(result)
      finished = true
      app.quit()
    } catch (err) {
      console.error(err)
      finished = true
      app.exit(1)
    }
  })
})
setTimeout(() => {
  if (!finished) {
    console.error('UI test timeout')
    app.exit(1)
  }
}, 45000).unref()
require(process.env.RUNBOOK_TEST_MAIN || '../electron/main')
