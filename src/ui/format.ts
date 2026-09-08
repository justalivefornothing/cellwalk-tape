export type ValueMode = 'dec' | 'hex' | 'ascii'

const CONTROL_NAMES: Readonly<Record<number, string>> = {
  0: 'NUL',
  9: 'TAB',
  10: 'LF',
  13: 'CR',
  27: 'ESC',
  32: 'SP',
  127: 'DEL',
}

/** Render a cell byte for the tape view. */
export function formatCell(value: number, mode: ValueMode): string {
  switch (mode) {
    case 'hex':
      return value.toString(16).toUpperCase().padStart(2, '0')
    case 'ascii': {
      const named = CONTROL_NAMES[value]
      if (named !== undefined) return named
      if (value > 32 && value < 127) return String.fromCharCode(value)
      return '·'
    }
    default:
      return String(value)
  }
}

/** Compact op count: 1, 999, 1.2k, 100k, 3.4M. */
export function formatOps(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return trim(n / 1000) + 'k'
  return trim(n / 1_000_000) + 'M'
}

function trim(x: number): string {
  return x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '')
}

/** Slider position 0..100 -> ops per frame 1..100k on a log scale. */
export function sliderToOps(pos: number): number {
  return Math.round(10 ** (pos / 20))
}
