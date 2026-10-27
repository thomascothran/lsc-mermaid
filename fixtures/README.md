# Fixtures

One directory per worked example in the proposal's "Worked examples" section:

- `chart.lsc`: the example, character for character. A test fails if it drifts from the spec.
- `expected.ts`: what `lsc-model` must produce for it (see `types.ts`).

Every fixture must parse, validate with exactly the listed diagnostics, and round-trip through
JSON (the Phase 1 gate).

## Conventions in `expected.ts`

- **Lines** are 1-based and count from the header line.
- **Lifetimes.** An instance's first lifetime has its plain id; later ones are `name@2`, `name@3`.
- **Message ids.** A labelled occurrence (`send #first …`) has the id `name#label`. Unlabelled
  occurrences of a name are numbered in text order: `name`, `name#2`, `name#3`.
- **Locations.** Each lifetime's locations are numbered from 0 within each part (pre-chart and
  body). Location 0 is the top of the line and holds no events (p. 71: every instance starts at
  location zero, and no step enters it); event locations start at 1. Every lifetime has a
  location 0 in each part it is alive in.
- **Condition expressions** are given in canonical printed form after resolution: the value
  shorthand `idle` on `car` prints as `car.state = idle`, a quoted condition prints with its
  quotes, and an unresolved identifier prints as itself.
- **Guards and barriers.** A block's entry barrier is shared by the block's lifetimes alive when
  it starts; a lifetime created inside the block is not part of it. A chart with the `subchart`
  header is itself a block.
- **Order facts** (`order.before`, `order.unordered`) must hold in every unfolding that contains
  both points. References are `msg!` / `msg?` (send / receive of a message id), `L12` (the
  location or barrier created by line 12) and `inst@L12` (instance `inst`'s location from line 12).
- **Unfoldings.** Each subchart, and a standalone subchart chart itself, is either run to its
  end or left at one of its cold conditions; each `if` takes one branch. `main` counts the
  unfoldings in which no cold condition fails.
- **Diagnostics** list every diagnostic expected, with the line it is reported on.
