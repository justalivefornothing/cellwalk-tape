import { describe, expect, it } from 'vitest'
import { compile, CompileError, OP, sameCode, toggleBreakpointInSource } from './compile.ts'
import { Machine } from './machine.ts'
import { GALLERY } from './programs.ts'
import { run } from './run.ts'

const HELLO =
  '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.'

describe('spec', () => {
  it('prints Hello World', () => {
    expect(run(HELLO).output).toBe('Hello World!\n')
  })
  it('cat echoes input until EOF', () => {
    expect(run(',[.,]', { input: 'abc' }).output).toBe('abc')
  })
  it('reports an unmatched [ with its offset before running', () => {
    expect(() => compile('[[]')).toThrow(/Unmatched \[ at offset 0/)
  })
  it('cells wrap at 8 bits', () => {
    expect(run('-').tape[0]).toBe(255)
  })
  it('moves a value between cells', () => {
    expect(run('+++[>+<-]').tape[1]).toBe(3)
  })
})

describe('compile', () => {
  it('strips comments and maps instructions back to source offsets', () => {
    const p = compile('add +\nmove >  loop [-]')
    expect(Array.from(p.code)).toEqual([OP.INC, OP.RIGHT, OP.OPEN, OP.DEC, OP.CLOSE])
    expect(Array.from(p.srcMap)).toEqual([4, 11, 19, 20, 21])
    expect(p.srcToInstr[4]).toBe(0)
    expect(p.srcToInstr[0]).toBe(-1)
  })
  it('pairs brackets in the jump table', () => {
    const p = compile('[[-]>[+]]')
    expect(Array.from(p.jumpTable)).toEqual([8, 3, -1, 1, -1, 7, -1, 5, 0])
  })
  it('records loop depth with the halt slot at depth 0', () => {
    const p = compile('+[>[-]<]')
    expect(Array.from(p.depth)).toEqual([0, 0, 1, 1, 2, 2, 1, 1, 0])
  })
  it('reports an unmatched ] with its offset', () => {
    expect(() => compile('++]')).toThrow(/Unmatched \] at offset 2/)
    try {
      compile('++]')
    } catch (e) {
      expect(e).toBeInstanceOf(CompileError)
      expect((e as CompileError).offset).toBe(2)
    }
  })
  it('# attaches a breakpoint to the next instruction', () => {
    const p = compile('+ # stop here\n+>')
    expect(Array.from(p.breakpoints)).toEqual([0, 1, 0])
  })
  it('toggles a # marker in the source', () => {
    const src = '+>+'
    const withBp = toggleBreakpointInSource(src, 1)
    expect(withBp).toBe('+#>+')
    expect(toggleBreakpointInSource(withBp, 2)).toBe(src)
    expect(toggleBreakpointInSource('+ x >', 2)).toBe('+ x >')
    expect(sameCode(compile(src), compile(withBp))).toBe(true)
  })
})

describe('machine', () => {
  it('stops at breakpoints and resumes past them', () => {
    const m = new Machine(compile('+#+#+'))
    expect(m.run(100)).toBe('breakpoint')
    expect(m.ip).toBe(1)
    expect(m.tape[0]).toBe(1)
    expect(m.run(100)).toBe('breakpoint')
    expect(m.ip).toBe(2)
    expect(m.run(100)).toBe('halt')
    expect(m.tape[0]).toBe(3)
    expect(m.ops).toBe(3)
  })
  it('yields when the budget runs out', () => {
    const m = new Machine(compile('++++'))
    expect(m.run(3)).toBe('budget')
    expect(m.ip).toBe(3)
    expect(m.run(3)).toBe('halt')
    expect(m.ops).toBe(4)
  })
  it('steps out of the current loop', () => {
    const m = new Machine(compile('+++[>+<-]>.'))
    m.step() // +
    m.step() // +
    m.step() // +
    m.step() // [ enter loop
    m.step() // >
    expect(m.depth).toBe(1)
    expect(m.run(1000, m.stepOutTarget())).toBe('stepout')
    expect(m.ip).toBe(9) // the > after the loop
    expect(m.tape[1]).toBe(3)
    expect(m.depth).toBe(0)
  })
  it('applies the EOF mode when input runs dry', () => {
    expect(run('+++,', { eof: 0 }).tape[0]).toBe(0)
    expect(run('+++,', { eof: -1 }).tape[0]).toBe(255)
    expect(run('+++,', { eof: 'unchanged' }).tape[0]).toBe(3)
  })
  it('wraps the head around the tape ends', () => {
    const r = run('<+', {})
    expect(r.ptr).toBe(29_999)
    expect(r.tape[29_999]).toBe(1)
    expect(run('<>', {}).ptr).toBe(0)
  })
  it('counts distinct cells written', () => {
    const m = new Machine(compile('+>+>>++<<<-'))
    m.run(100)
    expect(m.cellsTouched).toBe(3)
    m.reset()
    expect(m.cellsTouched).toBe(0)
    expect(m.output).toBe('')
  })
  it('bails out of non-terminating programs at maxOps', () => {
    const r = run('+[]', { maxOps: 1000 })
    expect(r.halted).toBe(false)
    expect(r.ops).toBe(1000)
  })
})

describe('gallery', () => {
  const byId = (id: string) => GALLERY.find((g) => g.id === id)!
  const runGallery = (id: string) => {
    const g = byId(id)
    return run(g.source, { input: g.input, eof: g.eof })
  }

  it('every program compiles', () => {
    for (const g of GALLERY) expect(() => compile(g.source)).not.toThrow()
  })
  it('hello', () => {
    expect(runGallery('hello').output).toBe('Hello World!\n')
  })
  it('cat', () => {
    expect(runGallery('cat').output).toBe('tape machine')
  })
  it('reverse', () => {
    expect(runGallery('reverse').output).toBe('klawllec')
  })
  it('squares', () => {
    const expected = Array.from({ length: 15 }, (_, i) => String((i + 1) ** 2).padStart(3, '0') + '\n').join('')
    expect(runGallery('squares').output).toBe(expected)
  })
  it('fibonacci', () => {
    const fibs = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]
    expect(runGallery('fib').output).toBe(fibs.map((n) => String(n).padStart(3, '0') + '\n').join(''))
  })
})
