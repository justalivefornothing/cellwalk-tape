# Cellwalk — plan

An eight-instruction tape-machine interpreter with a canvas tape visualizer,
bracket-jump precomputation, breakpoints, and adjustable execution speed.

## Goal

Make the classic eight-symbol tape language (`> < + - . , [ ]`) *watchable*.
Load "Hello", drag the speed slider to max, and see the head zip across the
tape while cells fill in and output characters land one by one in the
terminal strip. Everything from the compiler to the canvas renderer is
hand-written; no runtime dependencies except fonts.

## Features (all required)

- Interpreter with 30,000 8-bit wrapping cells and a Uint32 head pointer.
- Precomputed bracket jump table; unbalanced brackets are reported with their
  source offset *before* the program runs.
- Canvas tape view centered on the head, decimal / hex / ASCII value toggle,
  smooth head-slide animation between cells.
- Run / pause / step / step-out-of-loop / reset; speed from 1 to 100k ops per
  animation frame.
- Breakpoints: `#` in source, or click a source character to toggle one.
- Input panel consumed by `,`, with an EOF selector (0 / -1 / unchanged).
- Live stats: ops executed, current instruction pointer, cells touched.
- Program gallery: hello world, cat, reverse input, squares, fibonacci.

## Architecture

```
src/
  core/
    compile.ts     source -> { code, srcMap, jumpTable, breakpoints }  (DOM-free)
    machine.ts     Machine class: tape, pointer, ip, step(), runBudget(n), stepOut()
    run.ts         run(source, opts) convenience wrapper used by tests
    programs.ts    gallery sources
  ui/
    tape-canvas.ts canvas renderer: visible window around head, interpolated head x
    editor.ts      source view with clickable characters + breakpoint marks
    controls.ts    run/pause/step/step-out/reset, speed slider, EOF select
    stats.ts       ops / ip / cells-touched readouts
  main.ts          wires everything together with a requestAnimationFrame loop
  style.css        brutalist monochrome: white, 2px black borders, red accent
```

### Core algorithm

1. **Compile.** Walk the source once. Keep only the eight instruction
   characters (plus `#` as a breakpoint marker that attaches to the *next*
   instruction). Produce `code: Uint8Array` of opcodes and `srcMap: Uint32Array`
   mapping instruction index to source offset. A stack of open-bracket indices
   fills `jumpTable[i]` for each bracket; an unmatched bracket throws with its
   source offset.
2. **Execute.** `runBudget(n)` is a tight `switch` loop over the opcode array.
   Cells are a `Uint8Array(30000)` so `+`/`-` wrap for free. The loop stops on
   budget exhaustion, halt, breakpoint, or when `,` needs input that is not
   available. Step-out records the current loop depth and runs until the depth
   returns to that level.
3. **Render.** The canvas only draws the window of cells that fits on screen,
   centered on an interpolated head x-position that eases toward the real head
   each frame, so a single step reads as a slide instead of a jump.

## Milestones

1. Plan, license, gitignore.                             (chore)
2. Vite vanilla-ts scaffold, vitest.                     (chore)
3. Compiler + machine + `run()` with spec tests green.   (feat)
4. Canvas tape renderer with head-slide + value toggle.  (feat)
5. Controls, speed, step-out, breakpoints, editor.       (feat)
6. Input / EOF panel, stats, gallery.                    (feat)
7. Build, smoke screenshot, polish fixes.                (fix)
8. README.                                                (docs)
9. Private GitHub repo, topics.
