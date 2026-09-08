import { describe, expect, it } from 'vitest'
import { formatCell, formatOps, sliderToOps } from './format.ts'

describe('formatCell', () => {
  it('decimal is the plain number', () => {
    expect(formatCell(0, 'dec')).toBe('0')
    expect(formatCell(255, 'dec')).toBe('255')
  })
  it('hex is two upper-case digits', () => {
    expect(formatCell(10, 'hex')).toBe('0A')
    expect(formatCell(255, 'hex')).toBe('FF')
  })
  it('ascii shows printable characters and names for common controls', () => {
    expect(formatCell(72, 'ascii')).toBe('H')
    expect(formatCell(10, 'ascii')).toBe('LF')
    expect(formatCell(0, 'ascii')).toBe('NUL')
    expect(formatCell(32, 'ascii')).toBe('SP')
    expect(formatCell(200, 'ascii')).toBe('·')
  })
})

describe('speed', () => {
  it('maps the slider onto 1..100k ops per frame on a log scale', () => {
    expect(sliderToOps(0)).toBe(1)
    expect(sliderToOps(20)).toBe(10)
    expect(sliderToOps(60)).toBe(1000)
    expect(sliderToOps(100)).toBe(100_000)
  })
  it('formats op counts compactly', () => {
    expect(formatOps(3)).toBe('3')
    expect(formatOps(1000)).toBe('1k')
    expect(formatOps(1259)).toBe('1.3k')
    expect(formatOps(100_000)).toBe('100k')
    expect(formatOps(2_500_000)).toBe('2.5M')
  })
})
