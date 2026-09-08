/**
 * Compiler for the eight-symbol tape language.
 *
 * Source text is stripped down to instructions; everything else is a comment.
 * `#` is a breakpoint marker that attaches to the next instruction.
 * A stack-based prepass pairs every `[` with its `]` so the machine can jump
 * in O(1) instead of scanning for the matching bracket at runtime.
 */

export const OP = {
  RIGHT: 0, // >
  LEFT: 1, // <
  INC: 2, // +
  DEC: 3, // -
  OUT: 4, // .
  IN: 5, // ,
  OPEN: 6, // [
  CLOSE: 7, // ]
} as const

export type Op = (typeof OP)[keyof typeof OP]

/** Instruction characters, indexed by opcode. */
export const OP_CHARS = '><+-.,[]'

const CHAR_TO_OP: Readonly<Record<string, Op>> = {
  '>': OP.RIGHT,
  '<': OP.LEFT,
  '+': OP.INC,
  '-': OP.DEC,
  '.': OP.OUT,
  ',': OP.IN,
  '[': OP.OPEN,
  ']': OP.CLOSE,
}

export const BREAKPOINT_CHAR = '#'

export class CompileError extends Error {
  readonly offset: number
  constructor(message: string, offset: number) {
    super(message)
    this.name = 'CompileError'
    this.offset = offset
  }
}

export interface Program {
  /** Original source text. */
  readonly source: string
  /** Opcodes, one per instruction. */
  readonly code: Uint8Array
  /** Instruction index -> source offset. */
  readonly srcMap: Uint32Array
  /** Source offset -> instruction index, or -1 for comment characters. */
  readonly srcToInstr: Int32Array
  /** For each bracket, the index of its partner; -1 for other instructions. */
  readonly jumpTable: Int32Array
  /**
   * Loop nesting depth of each instruction (length code.length + 1; the
   * final entry is the halt position at depth 0). A `[` sits at the outer
   * depth, its body and matching `]` one level deeper — so "step out" simply
   * runs until depth[ip] drops below the depth where it started.
   */
  readonly depth: Uint16Array
  /** 1 where a `#` marker precedes the instruction. */
  readonly breakpoints: Uint8Array
}

export function compile(source: string): Program {
  const code: number[] = []
  const srcMap: number[] = []
  const bps: number[] = []
  const srcToInstr = new Int32Array(source.length).fill(-1)

  let pendingBreak = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === BREAKPOINT_CHAR) {
      pendingBreak = true
      continue
    }
    const op = CHAR_TO_OP[ch]
    if (op === undefined) continue
    srcToInstr[i] = code.length
    code.push(op)
    srcMap.push(i)
    bps.push(pendingBreak ? 1 : 0)
    pendingBreak = false
  }

  const len = code.length
  const jumpTable = new Int32Array(len).fill(-1)
  const depth = new Uint16Array(len + 1)
  const stack: number[] = []

  for (let i = 0; i < len; i++) {
    const op = code[i]
    if (op === OP.OPEN) {
      depth[i] = stack.length
      stack.push(i)
    } else if (op === OP.CLOSE) {
      const open = stack.pop()
      if (open === undefined) {
        throw new CompileError(`Unmatched ] at offset ${srcMap[i]}`, srcMap[i])
      }
      jumpTable[open] = i
      jumpTable[i] = open
      depth[i] = stack.length + 1
    } else {
      depth[i] = stack.length
    }
  }

  if (stack.length > 0) {
    const offset = srcMap[stack[0]]
    throw new CompileError(`Unmatched [ at offset ${offset}`, offset)
  }

  return {
    source,
    code: Uint8Array.from(code),
    srcMap: Uint32Array.from(srcMap),
    srcToInstr,
    jumpTable,
    depth,
    breakpoints: Uint8Array.from(bps),
  }
}

/** True when two programs have identical instruction streams (comments and `#` may differ). */
export function sameCode(a: Program, b: Program): boolean {
  if (a.code.length !== b.code.length) return false
  for (let i = 0; i < a.code.length; i++) if (a.code[i] !== b.code[i]) return false
  return true
}

/**
 * Toggle a breakpoint on the instruction at `offset` by inserting or removing
 * a `#` marker in the source. Returns the source unchanged if the offset is
 * not an instruction character.
 */
export function toggleBreakpointInSource(source: string, offset: number): string {
  const ch = source[offset]
  if (ch === undefined || CHAR_TO_OP[ch] === undefined) return source

  // Walk back over comment characters looking for a marker that would attach here.
  for (let i = offset - 1; i >= 0; i--) {
    const c = source[i]
    if (c === BREAKPOINT_CHAR) return source.slice(0, i) + source.slice(i + 1)
    if (CHAR_TO_OP[c] !== undefined) break
  }
  return source.slice(0, offset) + BREAKPOINT_CHAR + source.slice(offset)
}
