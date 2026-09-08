import { OP, type Program } from './compile.ts'

/** What `,` writes when input is exhausted. */
export type EofMode = 0 | -1 | 'unchanged'

export type StopReason = 'budget' | 'halt' | 'breakpoint' | 'stepout'

export interface MachineOptions {
  input?: string
  eof?: EofMode
  tapeSize?: number
}

export const TAPE_SIZE = 30_000

/** Latin-1: one byte per character, so output round-trips for code points < 256. */
function encode(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes
}

/**
 * The tape machine. Cells are a Uint8Array so `+` and `-` wrap for free; the
 * head wraps around the ends of the tape. `run(budget)` executes at most
 * `budget` instructions so a caller can interleave execution with rendering.
 */
export class Machine {
  program: Program
  readonly tape: Uint8Array
  /** Mutable copy of the program's breakpoint flags. */
  breakpoints: Uint8Array
  eof: EofMode

  ptr = 0
  ip = 0
  ops = 0
  output = ''
  cellsTouched = 0

  private input: Uint8Array
  private inputPos = 0
  private touched: Uint8Array
  /** Instruction whose breakpoint has already fired; resuming from it must not re-fire. */
  private breakSkipIp = -1

  constructor(program: Program, opts: MachineOptions = {}) {
    this.program = program
    this.breakpoints = Uint8Array.from(program.breakpoints)
    this.eof = opts.eof ?? 0
    const size = opts.tapeSize ?? TAPE_SIZE
    this.tape = new Uint8Array(size)
    this.touched = new Uint8Array(size)
    this.input = encode(opts.input ?? '')
  }

  get halted(): boolean {
    return this.ip >= this.program.code.length
  }

  /** Loop nesting depth at the current instruction pointer. */
  get depth(): number {
    return this.program.depth[this.ip]
  }

  get inputLength(): number {
    return this.input.length
  }

  get inputConsumed(): number {
    return this.inputPos
  }

  setInput(text: string): void {
    this.input = encode(text)
    if (this.inputPos > this.input.length) this.inputPos = this.input.length
  }

  /**
   * Swap in a recompiled program whose instruction stream is identical (only
   * comments or `#` markers changed). Execution state is preserved.
   */
  setProgram(program: Program): void {
    this.program = program
    this.breakpoints = Uint8Array.from(program.breakpoints)
  }

  /** Clear tape, head, output and counters. Breakpoints and EOF mode persist. */
  reset(): void {
    this.tape.fill(0)
    this.touched.fill(0)
    this.ptr = 0
    this.ip = 0
    this.ops = 0
    this.output = ''
    this.cellsTouched = 0
    this.inputPos = 0
    this.breakSkipIp = -1
  }

  /** Execute exactly one instruction, ignoring a breakpoint on it. */
  step(): StopReason {
    this.breakSkipIp = this.ip
    return this.run(1)
  }

  /**
   * Depth to pass as `stopDepth` to leave the current loop. Returns -1 when
   * not inside a loop, in which case "step out" degrades to plain running.
   */
  stepOutTarget(): number {
    return this.depth - 1
  }

  /**
   * Run up to `budget` instructions. Stops early on halt, on a breakpoint, or
   * (when `stopDepth >= 0`) as soon as the loop depth drops to `stopDepth`.
   */
  run(budget: number, stopDepth = -1): StopReason {
    const { code, jumpTable, depth } = this.program
    const len = code.length
    const tape = this.tape
    const size = tape.length
    const touched = this.touched
    const bp = this.breakpoints
    const input = this.input

    let ip = this.ip
    let ptr = this.ptr
    let inputPos = this.inputPos
    let cellsTouched = this.cellsTouched
    let out = ''
    let n = 0
    let skipBp = ip === this.breakSkipIp
    this.breakSkipIp = -1
    let reason: StopReason = 'budget'

    while (n < budget) {
      if (ip >= len) {
        reason = 'halt'
        break
      }
      if (bp[ip] === 1 && !skipBp) {
        reason = 'breakpoint'
        this.breakSkipIp = ip
        break
      }
      skipBp = false

      switch (code[ip]) {
        case OP.RIGHT:
          ptr = ptr + 1 === size ? 0 : ptr + 1
          break
        case OP.LEFT:
          ptr = ptr === 0 ? size - 1 : ptr - 1
          break
        case OP.INC:
          tape[ptr]++
          if (touched[ptr] === 0) {
            touched[ptr] = 1
            cellsTouched++
          }
          break
        case OP.DEC:
          tape[ptr]--
          if (touched[ptr] === 0) {
            touched[ptr] = 1
            cellsTouched++
          }
          break
        case OP.OUT:
          out += String.fromCharCode(tape[ptr])
          break
        case OP.IN:
          if (inputPos < input.length) tape[ptr] = input[inputPos++]
          else if (this.eof === 0) tape[ptr] = 0
          else if (this.eof === -1) tape[ptr] = 255
          if (touched[ptr] === 0) {
            touched[ptr] = 1
            cellsTouched++
          }
          break
        case OP.OPEN:
          if (tape[ptr] === 0) ip = jumpTable[ip]
          break
        case OP.CLOSE:
          if (tape[ptr] !== 0) ip = jumpTable[ip]
          break
      }
      ip++
      n++

      if (ip >= len) {
        reason = 'halt'
        break
      }
      if (stopDepth >= 0 && depth[ip] <= stopDepth) {
        reason = 'stepout'
        break
      }
    }

    this.ip = ip
    this.ptr = ptr
    this.inputPos = inputPos
    this.cellsTouched = cellsTouched
    this.ops += n
    if (out.length > 0) this.output += out
    return reason
  }
}
