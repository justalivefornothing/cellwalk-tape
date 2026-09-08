import { compile } from './compile.ts'
import { Machine, type EofMode } from './machine.ts'

export interface RunOptions {
  input?: string
  eof?: EofMode
  /** Safety valve for non-terminating programs. */
  maxOps?: number
}

export interface RunResult {
  output: string
  tape: Uint8Array
  ptr: number
  ops: number
  /** False when `maxOps` was hit before the program finished. */
  halted: boolean
}

/** Compile and run a program to completion, ignoring breakpoints. */
export function run(source: string, opts: RunOptions = {}): RunResult {
  const program = compile(source)
  const machine = new Machine(program, { input: opts.input, eof: opts.eof })
  machine.breakpoints.fill(0)

  const maxOps = opts.maxOps ?? 50_000_000
  const budget = 1 << 16
  while (!machine.halted && machine.ops < maxOps) {
    machine.run(Math.min(budget, maxOps - machine.ops))
  }

  return {
    output: machine.output,
    tape: machine.tape,
    ptr: machine.ptr,
    ops: machine.ops,
    halted: machine.halted,
  }
}
