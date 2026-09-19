# Cellwalk Tape

Eight-instruction tape-machine interpreter with a canvas tape visualizer, bracket-jump precomputation, breakpoints, and adjustable execution speed.

Classic symbols: `> < + - . , [ ]`

## Features

- 30,000 8-bit wrapping cells + `Uint32` head pointer
- Precomputed bracket jump table; unbalanced brackets reported with source offset before run
- Canvas tape view centered on the head (decimal / hex / ASCII toggle)
- Smooth head-slide animation between cells
- Run / pause / step / step-out-of-loop / reset
- Speed from 1 to 100k ops per animation frame
- Breakpoints via `#` in source or click a character
- Input panel for `,` with EOF selector (0 / −1 / unchanged)
- Live stats: ops executed, IP, cells touched
- Gallery: hello world, cat, reverse, squares, fibonacci

## Run

```bash
npm install
npm run dev
npm test
```

## Layout

| Path | Role |
|------|------|
| `src/core/` | Compile, machine, run, gallery programs |
| `src/ui/` | Tape canvas, editor, controls, stats |
| `src/main.ts` | Wiring + rAF loop |

## License

MIT
