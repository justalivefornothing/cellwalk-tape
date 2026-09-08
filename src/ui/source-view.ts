import { BREAKPOINT_CHAR, OP_CHARS, type Program } from '../core/compile.ts'

/**
 * Read-only rendering of the source with one span per character. Instruction
 * characters are clickable (they toggle a breakpoint), the current instruction
 * is inverted, and `#` markers plus the instructions they guard are red.
 */
export class SourceView {
  private readonly root: HTMLElement
  private spans: HTMLSpanElement[] = []
  private program: Program | null = null
  private ipSpan: HTMLSpanElement | null = null
  onToggle: ((offset: number) => void) | null = null

  constructor(root: HTMLElement) {
    this.root = root
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (!(t instanceof HTMLSpanElement) || !t.classList.contains('op')) return
      this.onToggle?.(Number(t.dataset.offset))
    })
  }

  /** Render `source`; `program` may be null when it failed to compile. */
  render(source: string, program: Program | null, errorOffset = -1): void {
    this.program = program
    this.ipSpan = null
    this.spans = []
    const frag = document.createDocumentFragment()

    let pendingBp = false
    for (let i = 0; i < source.length; i++) {
      const ch = source[i]
      const span = document.createElement('span')
      span.textContent = ch
      span.dataset.offset = String(i)
      if (ch === BREAKPOINT_CHAR) {
        span.className = 'mark'
        pendingBp = true
      } else if (OP_CHARS.includes(ch)) {
        span.className = pendingBp ? 'op bp' : 'op'
        span.title = pendingBp ? 'Remove breakpoint' : 'Set breakpoint'
        pendingBp = false
      } else {
        span.className = 'cm'
      }
      if (i === errorOffset) span.classList.add('err')
      this.spans.push(span)
      frag.appendChild(span)
    }
    this.root.replaceChildren(frag)
  }

  /** Highlight the instruction about to execute; `ip === code.length` clears it. */
  setIp(ip: number): void {
    if (this.ipSpan) this.ipSpan.classList.remove('ip')
    this.ipSpan = null
    if (!this.program || ip < 0 || ip >= this.program.code.length) return
    const span = this.spans[this.program.srcMap[ip]]
    if (!span) return
    span.classList.add('ip')
    this.ipSpan = span
    // Keep the active instruction in view without stealing page scroll.
    const r = span.getBoundingClientRect()
    const p = this.root.getBoundingClientRect()
    if (r.top < p.top || r.bottom > p.bottom) {
      this.root.scrollTop += r.top - p.top - p.height / 2
    }
  }
}
