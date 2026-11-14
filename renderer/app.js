const bridge = window.bridge
const worker = '/workers/main.js'
const decoder = new TextDecoder()
const $ = (id) => document.getElementById(id)
const pending = new Map()
let sequence = 0
const session = crypto.randomUUID()
let connected = false
let connecting = false
let connectionAttempt = 0
let loadSequence = 0
let items = []
let selected = null
let view = 'library'
let page = 1
let returnFocusId = null
const completed = new Map()

function request(action, payload) {
  const id = `${session}:${++sequence}`
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Request timed out'))
    }, 15000)
    pending.set(id, { resolve, reject, timeout })
    bridge.writeWorkerIPC(worker, JSON.stringify({ id, action, payload })).catch((err) => {
      clearTimeout(timeout)
      pending.delete(id)
      reject(err)
    })
  })
}
function notice(message, error = false) {
  $('message').textContent = message
  $('message').classList.toggle('error', error)
}
function node(tag, className, text) {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (text !== undefined) el.textContent = text
  return el
}
function render() {
  $('count').textContent = items.length
  $('library').replaceChildren()
  $('detail').hidden = true
  $('library').hidden = false
  $('top').hidden = false
  $('toolbar').hidden = false
  view = 'library'
  const query = $('search').value.trim().toLowerCase()
  const category = $('filter').value
  const visible = items.filter(
    (item) =>
      (!category || item.category === category) &&
      [item.title, item.description, item.category].join(' ').toLowerCase().includes(query)
  )
  const pages = Math.max(1, Math.ceil(visible.length / 6))
  page = Math.max(1, Math.min(page, pages))
  $('pagination').hidden = visible.length === 0
  $('page-status').textContent = `Page ${page} of ${pages} · ${visible.length} matching playbooks`
  $('previous').disabled = page === 1
  $('next').disabled = page === pages
  if (!visible.length) {
    $('library').append(
      node(
        'div',
        'empty',
        items.length
          ? 'No matching playbooks. Try another search.'
          : 'No playbooks yet. Create your first recovery guide.'
      )
    )
    return
  }
  for (const item of visible.slice((page - 1) * 6, page * 6)) {
    const card = node('button', 'tile')
    card.append(
      node('span', 'category', item.category),
      node('h3', '', item.title),
      node('p', '', item.description || 'Step-by-step recovery guide'),
      node('footer', '', `${item.steps.length} recovery steps`)
    )
    card.dataset.id = item.id
    card.onclick = () => {
      returnFocusId = item.id
      showDetail(item)
      $('detail').focus()
    }
    $('library').append(card)
  }
}
function rootScrollToTop() {
  document.scrollingElement?.scrollTo({ top: 0, behavior: 'instant' })
}
function showDetail(item) {
  selected = item
  $('pagination').hidden = true
  $('library').hidden = true
  $('top').hidden = true
  $('toolbar').hidden = true
  $('detail').hidden = false
  view = 'detail'
  rootScrollToTop()
  const root = $('detail')
  root.replaceChildren()
  const back = node('button', 'back', '← Back to library')
  back.onclick = () => {
    selected = null
    render()
    rootScrollToTop()
    Array.from($('library').children)
      .find((el) => el.dataset.id === returnFocusId)
      ?.focus()
  }
  const heading = node('div', 'detail-top')
  const left = node('div')
  left.append(
    node('div', 'eyebrow', item.category.toUpperCase()),
    node('h2', '', item.title),
    node('p', 'muted', item.description || 'Follow each step to complete this recovery guide.')
  )
  heading.append(left)
  const summary = node('p', 'muted')
  const track = node('div', 'progress-track')
  const fill = document.createElement('progress')
  fill.max = item.steps.length
  fill.setAttribute('aria-label', 'Recovery steps completed')
  fill.className = 'progress-fill'
  track.append(fill)
  const steps = node('div')
  const progress = completed.get(item.id) || new Set()
  const checkboxes = []
  function refreshProgress() {
    const count = progress.size
    summary.textContent = `${count} of ${item.steps.length} steps completed · ${Math.round((count / item.steps.length) * 100)}%`
    fill.value = count
  }
  item.steps.forEach((step, index) => {
    const row = node('label', 'step')
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = progress.has(index)
    const text = node('span', '', step.text)
    if (check.checked) row.classList.add('done')
    check.onchange = () => {
      if (check.checked) progress.add(index)
      else progress.delete(index)
      completed.set(item.id, progress)
      row.classList.toggle('done', check.checked)
      refreshProgress()
      if (progress.size === item.steps.length) notice('Recovery checklist completed.')
    }
    checkboxes.push({ check, row })
    row.append(check, text)
    steps.append(row)
  })
  const actions = node('div', 'detail-actions')
  const reset = node('button', 'secondary', 'Reset progress')
  reset.onclick = () => {
    progress.clear()
    completed.delete(item.id)
    for (const { check, row } of checkboxes) {
      check.checked = false
      row.classList.remove('done')
    }
    refreshProgress()
    notice('Progress reset.')
  }
  const remove = node('button', 'danger', 'Delete playbook')
  remove.onclick = async () => {
    const confirmed = await confirmDeletion(item.title)
    if (!confirmed) return
    try {
      await request('remove', { id: item.id })
      selected = null
      completed.delete(item.id)
      await load()
      $('search').focus()
      rootScrollToTop()
      notice('Playbook deleted.')
    } catch (err) {
      notice(err.message, true)
    }
  }
  actions.append(reset, remove)
  root.append(back, heading, summary, track, steps, actions)
  root.classList.remove('view-enter')
  void root.offsetWidth
  root.classList.add('view-enter')
  refreshProgress()
}
async function load() {
  const generation = ++loadSequence
  try {
    const records = await request('list')
    if (generation !== loadSequence) return
    items = records
    if (selected && view === 'detail') {
      const current = items.find((item) => item.id === selected.id)
      if (!current) {
        selected = null
        render()
      } else showDetail(current)
    } else render()
  } catch (err) {
    storageFailure('Unable to load playbooks: ' + err.message)
    throw err
  }
}
function confirmDeletion(title) {
  return new Promise((resolve) => {
    const dialog = $('confirm-delete')
    $('delete-title').textContent = title
    const cancel = $('delete-cancel')
    const accept = $('delete-accept')
    const finish = (value) => {
      dialog.removeEventListener('cancel', onCancel)
      cancel.removeEventListener('click', onNo)
      accept.removeEventListener('click', onYes)
      dialog.close()
      resolve(value)
    }
    const onCancel = (event) => {
      event.preventDefault()
      finish(false)
    }
    const onNo = () => finish(false)
    const onYes = () => finish(true)
    dialog.addEventListener('cancel', onCancel)
    cancel.addEventListener('click', onNo)
    accept.addEventListener('click', onYes)
    dialog.showModal()
    cancel.focus()
  })
}
$('new').onclick = () => {
  $('form-error').textContent = ''
  $('editor').showModal()
}
$('seed').onclick = async () => {
  $('seed').disabled = true
  try {
    const result = await request('seed')
    await load()
    notice(`${result.added} example playbooks added. Existing playbooks kept.`)
  } catch (err) {
    notice('Unable to add examples: ' + err.message, true)
  } finally {
    $('seed').disabled = false
  }
}
$('previous').onclick = () => {
  page--
  render()
  ;($('previous').disabled ? $('next') : $('previous')).focus()
}
$('next').onclick = () => {
  page++
  render()
  ;($('next').disabled ? $('previous') : $('next')).focus()
}
$('close').onclick = $('cancel').onclick = () => $('editor').close()
$('search').oninput = () => {
  page = 1
  render()
}
$('filter').onchange = () => {
  page = 1
  render()
}
$('all').onclick = () => {
  selected = null
  $('search').value = ''
  $('filter').value = ''
  page = 1
  render()
}
$('form').onsubmit = async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const steps = String(form.get('steps'))
    .split(/\r?\n/)
    .map((text) => ({ text: text.trim() }))
    .filter((s) => s.text)
  const submit = $('form').querySelector('[type=submit]')
  submit.disabled = true
  $('form-error').textContent = ''
  try {
    await request('save', {
      title: form.get('title'),
      category: form.get('category'),
      description: form.get('description'),
      steps
    })
    $('editor').close()
    $('form').reset()
    selected = null
    await load()
    notice('Playbook saved successfully.')
  } catch (err) {
    $('form-error').textContent = err.message
  } finally {
    submit.disabled = false
  }
}
bridge.onWorkerStderr(worker, (data) => console.error('Worker:', decoder.decode(data)))
bridge.onWorkerIPC(worker, (data) => {
  const message = decoder.decode(data)
  let event
  try {
    event = JSON.parse(message)
  } catch (_) {
    return
  }
  if (event.type === 'ready') {
    // Each window uses the status request below; ready is not a durable subscription.
  } else if (event.type === 'startup-error') storageFailure('Storage error: ' + event.error)
  else if (event.type === 'shutdown-error') notice('Unable to close storage: ' + event.error, true)
  else if (event.type === 'changed' && connected) load().catch(() => {})
  else if (event.type === 'response') {
    const task = pending.get(event.id)
    if (!task) return
    clearTimeout(task.timeout)
    pending.delete(event.id)
    if (event.ok) task.resolve(event.data)
    else task.reject(new Error(event.error || 'Operation failed'))
  }
})
function storageFailure(message) {
  if (/lock/i.test(message)) {
    message +=
      ' Another process may be using this library. Fully quit other Runbook instances, then retry; do not remove lock files.'
  }
  connected = false
  $('connection').textContent = 'Storage unavailable'
  document.querySelector('.status-dot').classList.remove('connected')
  $('retry-storage').hidden = false
  $('new').disabled = true
  $('seed').disabled = true
  if (!items.length) {
    $('library').replaceChildren(
      node(
        'div',
        'empty',
        'Unable to load playbooks. Your stored data has not been reset. Use Retry connection.'
      )
    )
  }
  notice(message, true)
}

async function connect(retry = false) {
  if (connecting) return
  connecting = true
  const attempt = ++connectionAttempt
  $('retry-storage').disabled = true
  $('new').disabled = true
  $('seed').disabled = true
  $('connection').textContent = 'Connecting to Autopass…'
  let timer
  try {
    const state = await Promise.race([
      bridge.startWorker(worker, retry),
      new Promise((resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('Storage startup timed out. Check other Runbook processes and retry.')
            ),
          15000
        )
      })
    ])
    clearTimeout(timer)
    if (state?.status === 'error') throw new Error(state.error)
    // Unlike the one-shot ready event, this also works with an already-open worker.
    await request('status')
    await load()
    if (attempt !== connectionAttempt) return
    connected = true
    $('connection').textContent = 'Autopass connected'
    document.querySelector('.status-dot').classList.add('connected')
    $('retry-storage').hidden = true
    $('new').disabled = false
    $('seed').disabled = false
    notice('')
  } catch (err) {
    storageFailure(
      err.message + ' Startup details: runbook-startup.log in the selected storage folder.'
    )
  } finally {
    clearTimeout(timer)
    connecting = false
    $('retry-storage').disabled = false
  }
}
$('retry-storage').onclick = () => connect(true)
bridge.onWorkerExit(worker, (code) => {
  for (const task of pending.values()) {
    clearTimeout(task.timeout)
    task.reject(new Error('Storage worker disconnected'))
  }
  pending.clear()
  storageFailure('Storage worker exited (' + code + '). Check the startup log or retry connection.')
})
connect()
