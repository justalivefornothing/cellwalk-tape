import '@fontsource-variable/inter'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './style.css'

import { compile, CompileError, sameCode, toggleBreakpointInSource, type Program } from './core/compile.ts'
import { Machine, TAPE_SIZE, type EofMode } from './core/machine.ts'
import { GALLERY } from './core/programs.ts'
import { formatOps, sliderToOps, type ValueMode } from './ui/format.ts'
import { SourceView } from './ui/source-view.ts'
import { TapeCanvas } from './ui/tape-canvas.ts'

type Status = 'ready' | 'running' | 'paused' | 'breakpoint' | 'halted' | 'error'
type Mode = 'idle' | 'run' | 'stepout'

const STATUS_LABEL: Record<Status, string> = {
  ready: 'READY',
  running: 'RUNNING',
  paused: 'PAUSED',
  breakpoint: 'BREAK',
  halted: 'HALTED',
  error: 'ERROR',
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header class="masthead">
  <h1>Cellwalk</h1>
  <p class="tagline">An eight-instruction tape machine you can watch. ${TAPE_SIZE.toLocaleString('en-US')} cells, eight bits each, one head.</p>
</header>

<section class="panel tape-panel" aria-label="Tape">
  <div class="panel-head">
    <h2>Tape</h2>
    <div class="seg" role="group" aria-label="Cell value format">
      <button type="button" data-mode="dec" aria-pressed="true">Dec</button>
      <button type="button" data-mode="hex" aria-pressed="false">Hex</button>
      <button type="button" data-mode="ascii" aria-pressed="false">Ascii</button>
    </div>
  </div>
  <canvas id="tape" role="img" aria-label="Tape cells around the head"></canvas>
</section>

<section class="panel controls" aria-label="Execution controls">
  <div class="buttons">
    <button type="button" id="run" class="primary">Run <kbd>Space</kbd></button>
    <button type="button" id="step">Step <kbd>S</kbd></button>
    <button type="button" id="stepout">Step out <kbd>O</kbd></button>
    <button type="button" id="reset">Reset <kbd>R</kbd></button>
  </div>
  <label class="speed">
    <span class="label">Speed</span>
    <input id="speed" type="range" min="0" max="100" value="10" aria-label="Operations per frame" />
    <output id="speed-out" for="speed">3 ops / frame</output>
  </label>
  <div class="status" id="status" data-status="ready" role="status">READY</div>
</section>

<div class="grid">
  <section class="panel source-panel" aria-label="Source">
    <div class="panel-head">
      <h2>Source</h2>
      <div class="gallery" role="group" aria-label="Program gallery" id="gallery"></div>
      <button type="button" id="edit" aria-pressed="false">Edit</button>
    </div>
    <p class="blurb" id="blurb"></p>
    <div class="error" id="error" role="alert" hidden></div>
    <pre class="source" id="source-view" aria-label="Program source"></pre>
    <textarea class="source-edit" id="source-edit" spellcheck="false" aria-label="Edit program source" hidden></textarea>
    <p class="hint">Click an instruction to toggle a breakpoint; a <code>#</code> in the source does the same. Everything except <code>&gt; &lt; + - . , [ ]</code> is a comment.</p>
  </section>

  <aside class="side">
    <section class="panel" aria-label="Input">
      <div class="panel-head">
        <h2>Input</h2>
        <label class="eof">EOF
          <select id="eof" aria-label="Value read at end of input">
            <option value="0">0</option>
            <option value="-1">-1</option>
            <option value="unchanged">unchanged</option>
          </select>
        </label>
      </div>
      <textarea id="input" class="input" rows="2" spellcheck="false" aria-label="Program input consumed by the comma instruction" placeholder="bytes for , to read"></textarea>
    </section>

    <section class="panel" aria-label="Output">
      <div class="panel-head"><h2>Output</h2></div>
      <pre class="terminal"><span id="out-text"></span><span class="cursor" aria-hidden="true"></span></pre>
    </section>

    <section class="panel stats" aria-label="Live stats">
      <dl>
        <div><dt>Ops</dt><dd id="st-ops">0</dd></div>
        <div><dt>IP</dt><dd id="st-ip">0 / 0</dd></div>
        <div><dt>Head</dt><dd id="st-head">0</dd></div>
        <div><dt>Cells touched</dt><dd id="st-cells">0</dd></div>
        <div><dt>Input</dt><dd id="st-input">0 / 0</dd></div>
        <div><dt>Loop depth</dt><dd id="st-depth">0</dd></div>
      </dl>
    </section>
  </aside>
</div>

<footer class="foot">
  <span>Cellwalk</span>
  <span>Bracket jumps precomputed · budgeted execution per frame · MIT</span>
</footer>
`

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

const els = {
  tape: $<HTMLCanvasElement>('#tape'),
  run: $<HTMLButtonElement>('#run'),
  step: $<HTMLButtonElement>('#step'),
  stepout: $<HTMLButtonElement>('#stepout'),
  reset: $<HTMLButtonElement>('#reset'),
  speed: $<HTMLInputElement>('#speed'),
  speedOut: $<HTMLOutputElement>('#speed-out'),
  status: $('#status'),
  gallery: $('#gallery'),
  blurb: $('#blurb'),
  edit: $<HTMLButtonElement>('#edit'),
  error: $('#error'),
  sourceView: $('#source-view'),
  sourceEdit: $<HTMLTextAreaElement>('#source-edit'),
  eof: $<HTMLSelectElement>('#eof'),
  input: $<HTMLTextAreaElement>('#input'),
  outText: $('#out-text'),
  stOps: $('#st-ops'),
  stIp: $('#st-ip'),
  stHead: $('#st-head'),
  stCells: $('#st-cells'),
  stInput: $('#st-input'),
  stDepth: $('#st-depth'),
}

const tape = new TapeCanvas(els.tape)
const view = new SourceView(els.sourceView)

let source = ''
let program: Program | null = null
let machine: Machine | null = null
let mode: Mode = 'idle'
let stopDepth = -1
let opsPerFrame = sliderToOps(Number(els.speed.value))
let dirty = true
let lastIp = -1
let lastOutLen = -1

// ---------- state transitions ----------

function setStatus(s: Status): void {
  els.status.textContent = STATUS_LABEL[s]
  els.status.dataset.status = s
  const ok = machine !== null && s !== 'error'
  const halted = machine?.halted ?? true
  els.run.disabled = !ok
  els.run.textContent = ''
  els.run.append(s === 'running' ? 'Pause ' : halted ? 'Run again ' : 'Run ', kbd('Space'))
  els.step.disabled = !ok || halted || s === 'running'
  els.stepout.disabled = !ok || halted || s === 'running'
  els.reset.disabled = !ok
  document.body.classList.toggle('is-running', s === 'running')
}

function kbd(text: string): HTMLElement {
  const k = document.createElement('kbd')
  k.textContent = text
  return k
}

function showError(err: CompileError | null): void {
  els.error.hidden = err === null
  els.error.textContent = err ? `${err.message} — fix the source to run.` : ''
}

/** Recompile `source`. Keeps machine state when only comments or `#` changed. */
function setSource(next: string, { resetMachine = false } = {}): void {
  source = next
  if (els.sourceEdit.value !== next) els.sourceEdit.value = next
  try {
    const compiled = compile(next)
    showError(null)
    if (machine && program && !resetMachine && sameCode(program, compiled)) {
      machine.setProgram(compiled)
    } else {
      mode = 'idle'
      machine = new Machine(compiled, { input: els.input.value, eof: readEof() })
      tape.snapTo(0)
    }
    program = compiled
    view.render(next, compiled)
    lastIp = -1
    lastOutLen = -1
    dirty = true
    setStatus(machine.halted ? 'halted' : machine.ops === 0 ? 'ready' : 'paused')
  } catch (e) {
    if (!(e instanceof CompileError)) throw e
    mode = 'idle'
    program = null
    machine = null
    showError(e)
    view.render(next, null, e.offset)
    setStatus('error')
  }
}

function readEof(): EofMode {
  const v = els.eof.value
  return v === 'unchanged' ? 'unchanged' : (Number(v) as EofMode)
}

function loadGallery(id: string): void {
  const g = GALLERY.find((p) => p.id === id)
  if (!g) return
  for (const b of els.gallery.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.id === id))
  }
  els.blurb.textContent = g.blurb
  els.input.value = g.input ?? ''
  els.eof.value = String(g.eof ?? 0)
  exitEdit()
  setSource(g.source, { resetMachine: true })
}

function resetMachine(): void {
  if (!machine) return
  mode = 'idle'
  machine.reset()
  machine.setInput(els.input.value)
  tape.snapTo(0)
  lastIp = -1
  lastOutLen = -1
  dirty = true
  setStatus('ready')
}

function toggleRun(): void {
  if (!machine) return
  if (mode !== 'idle') {
    mode = 'idle'
    setStatus('paused')
    return
  }
  if (machine.halted) resetMachine()
  mode = 'run'
  setStatus('running')
}

function stepOnce(): void {
  if (!machine || machine.halted || mode !== 'idle') return
  finish(machine.step())
}

function stepOut(): void {
  if (!machine || machine.halted || mode !== 'idle') return
  stopDepth = machine.stepOutTarget()
  mode = 'stepout'
  setStatus('running')
}

/** Apply a stop reason from the machine to the UI state. */
function finish(reason: string): void {
  dirty = true
  if (reason === 'budget') return
  mode = 'idle'
  if (reason === 'halt') setStatus('halted')
  else if (reason === 'breakpoint') setStatus('breakpoint')
  else setStatus('paused')
}

// ---------- editing ----------

function enterEdit(): void {
  mode = 'idle'
  if (machine && !machine.halted && machine.ops > 0) setStatus('paused')
  els.edit.setAttribute('aria-pressed', 'true')
  els.edit.textContent = 'Done'
  els.sourceView.hidden = true
  els.sourceEdit.hidden = false
  els.sourceEdit.value = source
  els.sourceEdit.focus()
}

function exitEdit(): void {
  if (els.sourceEdit.hidden) return
  els.edit.setAttribute('aria-pressed', 'false')
  els.edit.textContent = 'Edit'
  els.sourceView.hidden = false
  els.sourceEdit.hidden = true
  lastIp = -1
}

// ---------- wiring ----------

for (const g of GALLERY) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = g.name
  b.dataset.id = g.id
  b.setAttribute('aria-pressed', 'false')
  b.addEventListener('click', () => loadGallery(g.id))
  els.gallery.appendChild(b)
}

els.run.addEventListener('click', toggleRun)
els.step.addEventListener('click', stepOnce)
els.stepout.addEventListener('click', stepOut)
els.reset.addEventListener('click', resetMachine)

els.speed.addEventListener('input', () => {
  opsPerFrame = sliderToOps(Number(els.speed.value))
  els.speedOut.textContent = `${formatOps(opsPerFrame)} ${opsPerFrame === 1 ? 'op' : 'ops'} / frame`
})

for (const b of document.querySelectorAll<HTMLButtonElement>('.seg button')) {
  b.addEventListener('click', () => {
    for (const o of b.parentElement!.children) o.setAttribute('aria-pressed', 'false')
    b.setAttribute('aria-pressed', 'true')
    tape.mode = b.dataset.mode as ValueMode
    dirty = true
  })
}

els.edit.addEventListener('click', () => {
  if (els.sourceEdit.hidden) enterEdit()
  else exitEdit()
})
els.sourceEdit.addEventListener('input', () => setSource(els.sourceEdit.value))
els.sourceEdit.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    exitEdit()
    els.edit.focus()
  }
})

view.onToggle = (offset) => setSource(toggleBreakpointInSource(source, offset))

els.input.addEventListener('input', () => {
  machine?.setInput(els.input.value)
  dirty = true
})
els.eof.addEventListener('change', () => {
  if (machine) machine.eof = readEof()
})

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('textarea, input, select') || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === ' ' && !t.closest('button')) {
    e.preventDefault()
    toggleRun()
  } else if (e.key === 's' || e.key === 'S') stepOnce()
  else if (e.key === 'o' || e.key === 'O') stepOut()
  else if (e.key === 'r' || e.key === 'R') resetMachine()
})

document.fonts?.ready.then(() => {
  dirty = true
})

// ---------- frame loop ----------

function frame(): void {
  if (machine && mode !== 'idle') {
    finish(mode === 'stepout' ? machine.run(opsPerFrame, stopDepth) : machine.run(opsPerFrame))
  }

  if (machine && (dirty || tape.animating)) {
    tape.draw(machine)
    dirty = false

    if (machine.ip !== lastIp) {
      lastIp = machine.ip
      if (els.sourceEdit.hidden) view.setIp(machine.ip)
      els.stIp.textContent = `${machine.ip} / ${machine.program.code.length}`
      els.stDepth.textContent = String(machine.depth)
    }
    if (machine.output.length !== lastOutLen) {
      lastOutLen = machine.output.length
      els.outText.textContent = machine.output
      els.outText.parentElement!.scrollTop = 1e9
    }
    els.stOps.textContent = machine.ops.toLocaleString('en-US')
    els.stHead.textContent = String(machine.ptr)
    els.stCells.textContent = machine.cellsTouched.toLocaleString('en-US')
    els.stInput.textContent = `${machine.inputConsumed} / ${machine.inputLength}`
  }
  requestAnimationFrame(frame)
}

loadGallery('hello')
els.speed.dispatchEvent(new Event('input'))
requestAnimationFrame(frame)
