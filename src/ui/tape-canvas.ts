import type { Machine } from '../core/machine.ts'
import { formatCell, type ValueMode } from './format.ts'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const CELL_H = 72
const CELL_TOP = 30
const BORDER = 2

/**
 * Draws the window of cells around the head. The head has a real position
 * (machine.ptr) and a drawn position (headX) that eases toward it every
 * frame, so a single step reads as a slide instead of a jump.
 */
export class TapeCanvas {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private headX = 0
  mode: ValueMode = 'dec'

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d canvas unsupported')
    this.ctx = ctx
    new ResizeObserver(() => this.resize()).observe(canvas)
    this.resize()
  }

  /** True while the drawn head is still sliding toward the real head. */
  get animating(): boolean {
    return this.headX !== Math.round(this.headX)
  }

  snapTo(ptr: number): void {
    this.headX = ptr
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, Math.floor(rect.width))
    this.height = Math.max(1, Math.floor(rect.height))
    this.canvas.width = Math.floor(this.width * dpr)
    this.canvas.height = Math.floor(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private cellWidth(): number {
    return this.width < 520 ? 48 : 64
  }

  /** Advance the slide animation one frame. Returns true if it moved. */
  private ease(target: number, visible: number): boolean {
    const diff = target - this.headX
    if (diff === 0) return false
    // Far jumps (or wrapping around the tape) snap instead of sliding forever.
    if (Math.abs(diff) > visible * 2) {
      this.headX = target
      return true
    }
    this.headX = Math.abs(diff) < 0.02 ? target : this.headX + diff * 0.28
    return true
  }

  draw(m: Machine): void {
    const { ctx, width, height } = this
    const cellW = this.cellWidth()
    const visible = Math.ceil(width / cellW) + 2
    const size = m.tape.length
    this.ease(m.ptr, visible)

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    const cx = width / 2
    const first = Math.floor(this.headX - visible / 2)
    const last = Math.ceil(this.headX + visible / 2)

    ctx.lineWidth = BORDER
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = first; i <= last; i++) {
      if (i < 0 || i >= size) continue
      const x = cx + (i - this.headX) * cellW - cellW / 2
      const isHead = i === m.ptr
      const value = m.tape[i]

      if (isHead) {
        ctx.fillStyle = '#000'
        ctx.fillRect(x, CELL_TOP, cellW, CELL_H)
      } else {
        ctx.strokeStyle = '#000'
        ctx.strokeRect(x + BORDER / 2, CELL_TOP + BORDER / 2, cellW - BORDER, CELL_H - BORDER)
      }

      const label = formatCell(value, this.mode)
      const big = label.length <= 2 ? 22 : label.length === 3 ? 18 : 13
      ctx.font = `600 ${big}px ${MONO}`
      ctx.fillStyle = isHead ? '#fff' : value === 0 ? '#9a9a9a' : '#000'
      ctx.fillText(label, x + cellW / 2, CELL_TOP + CELL_H / 2 + 1)

      ctx.font = `500 11px ${MONO}`
      ctx.fillStyle = isHead ? '#000' : '#8a8a8a'
      ctx.fillText(String(i), x + cellW / 2, CELL_TOP + CELL_H + 16)
    }

    // Head marker: a triangle above the real head cell.
    const hx = cx + (m.ptr - this.headX) * cellW
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.moveTo(hx - 9, 6)
    ctx.lineTo(hx + 9, 6)
    ctx.lineTo(hx, CELL_TOP - 6)
    ctx.closePath()
    ctx.fill()

    // Edge fades so the tape reads as continuing off screen.
    const fadeW = Math.min(64, width / 6)
    for (const side of [0, 1]) {
      const g = ctx.createLinearGradient(side ? width - fadeW : 0, 0, side ? width : fadeW, 0)
      g.addColorStop(side ? 1 : 0, 'rgba(255,255,255,1)')
      g.addColorStop(side ? 0 : 1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(side ? width - fadeW : 0, 0, fadeW, height)
    }
  }
}
