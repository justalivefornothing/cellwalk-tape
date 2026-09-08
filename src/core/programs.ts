import type { EofMode } from './machine.ts'

export interface GalleryProgram {
  id: string
  name: string
  blurb: string
  source: string
  input?: string
  eof?: EofMode
}

/**
 * Print the byte under the head as three decimal digits and a newline.
 * Needs the eight cells to its right to be zero and leaves them zero.
 *
 * divmod by ten: the counter cell starts at 10 and is decremented with n.
 * When it is still non zero the head walks two cells right onto a zero and
 * the bracket block is skipped; when it hits zero the head stays put and the
 * next bracket block fires, resetting the counter and bumping the quotient.
 * Where the head ends up encodes the condition, so no flag cell is needed.
 */
const PRINT3 = [
  '>++++++++++<[->-[>+>>]>[[-]<++++++++++>>+>>]<<<<<]', // ones in cell 2 and quotient in cell 3
  '>>>>++++++++++<[->-[>+>>]>[[-]<++++++++++>>+>>]<<<<<]', // tens in cell 5 and hundreds in cell 6
  '<<[-]>>>[-]>>', // clear the two counters and stand on hundreds
  '>++++++[<++++++++>-]<.[-]', // add 48 and print hundreds
  '<<++++++[>++++++++<-]>.[-]', // tens
  '<<<<++++++[>++++++++<-]>.[-]', // ones
  '>>>>>++++++++++.[-]<<<<<<<', // newline then back to the base cell
].join('\n  ')

export const GALLERY: GalleryProgram[] = [
  {
    id: 'hello',
    name: 'Hello',
    blurb: 'The classic. Sets up a few base values with a nested loop, then walks between them spelling the greeting.',
    source:
      'Hello World\n' +
      '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]\n' +
      '>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.\n',
  },
  {
    id: 'cat',
    name: 'Cat',
    blurb: 'Echoes its input. Reads a byte, and while it is non zero prints it and reads the next one.',
    source: 'Cat  read then print until end of input\n,[.,]\n',
    input: 'tape machine',
    eof: 0,
  },
  {
    id: 'reverse',
    name: 'Reverse',
    blurb: 'Reads the whole input onto the tape one cell per byte, then walks back to the start printing as it goes.',
    source: 'Reverse  fill the tape then walk back\n>,[>,]<[.<]\n',
    input: 'cellwalk',
    eof: 0,
  },
  {
    id: 'squares',
    name: 'Squares',
    blurb: 'Prints 1² through 15² by adding successive odd numbers. The decimal printer is a hand written divmod.',
    source:
      'Squares of one through fifteen\n' +
      '+++++++++++++++ counter\n' +
      '>>+<< odd starts at one\n' +
      '[\n' +
      '  >>[<+>>+<-]>[<+>-] square plus odd\n' +
      '  <++ next odd\n' +
      '  <[>>+>+<<<-]>>[<<+>>-]> copy square into the print area\n' +
      `  ${PRINT3}\n` +
      '  <<<<-\n' +
      ']\n',
  },
  {
    id: 'fib',
    name: 'Fibonacci',
    blurb: 'Thirteen Fibonacci numbers, the most that fit in a byte. Two cells hold the pair; a temp cell does the shuffle.',
    source:
      'Fibonacci numbers below 256\n' +
      '+++++++++++++ counter\n' +
      '>+>+<< a and b start at one\n' +
      '[\n' +
      '  >[>>+>+<<<-]>>[<<+>>-]> copy a into the print area\n' +
      `  ${PRINT3}\n` +
      '  <<<[>>+<<-]>[<+>>+<-]>[<+>-] a b becomes b a plus b\n' +
      '  <<<-\n' +
      ']\n',
  },
]
