// Screenshot the app once the 3-D view and the readout table have rendered, via headless Chrome + DevTools protocol.
// usage: CHROME=/usr/bin/google-chrome node scripts/shot.mjs URL OUT.png [width] [height] [dark] [script]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PORT = 9319
const [url, out, w = '1440', h = '1100', dark, script] = process.argv.slice(2)
const chrome = spawn(
  process.env.CHROME ?? 'google-chrome',
  ['--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--window-size=${w},${h}`, 'about:blank'],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) pending.get(m.id)(m.result ?? m.error)
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 })
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await send('Page.navigate', { url })
  let done = false
  for (let i = 0; i < 120 && !done; i++) {
    await sleep(500)
    const r = await send('Runtime.evaluate', { expression: "!!document.querySelector('.scene-canvas canvas') && document.querySelectorAll('table.data td').length > 0", returnByValue: true })
    done = r.result?.value === true
  }
  if (script) await send('Runtime.evaluate', { expression: script })
  await sleep(1500) // let the first WebGL frames draw
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(done ? 'app ready' : 'TIMED OUT waiting for the app', '→', out)
  if (errors.length) console.log('page errors:\n' + errors.join('\n'))
  ws.close()
} finally {
  chrome.kill()
}
