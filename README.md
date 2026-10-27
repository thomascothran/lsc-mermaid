# Live Sequence Charts for Mermaid

Live Sequence Charts (Damm & Harel, 2001) as a Mermaid diagram type. The design is in
[`docs/Live Sequence Charts for Mermaid — Proposal.md`](docs/Live%20Sequence%20Charts%20for%20Mermaid%20—%20Proposal.md).

Status: the model library (`lsc-model`) reads the full notation and builds the semantic model,
with validation, unfoldings, the partial order and JSON. The Mermaid renderer draws only the
chart frame so far.

## Packages

| Package                               | Contents                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| [`lsc-model`](packages/lsc-model)     | DOM-free Langium parser, semantic model, validator, unfoldings, partial order, JSON |
| [`mermaid-lsc`](packages/mermaid-lsc) | Mermaid external diagram: detector, loader, db, renderer, styles                    |

## Using `lsc-model`

```ts
import { parseLsc, validateLsc, unfoldings, partialOrder, toJSON } from 'lsc-model';

const { model, diagnostics } = parseLsc(text); // never throws
if (model) {
  diagnostics.push(...validateLsc(model));
  const order = partialOrder(model); // the first main unfolding, by default
}
```

`parseLsc` reports syntax errors and the rules tied to the source text. `validateLsc` reports
the rules checked on the model's unfoldings and partial order (V1, V2, V5, V8) and per message
(V14, V16). `model` is `undefined` when the chart can't be laid out: on syntax errors and on
the rules marked ✱ in the proposal (`isBlocking`).

## Development

Requires Node 20+ and pnpm. On NixOS, `nix shell nixpkgs#pnpm` provides pnpm.

```sh
pnpm install
pnpm test        # generates the Langium parser, then runs Vitest
pnpm check       # format check, lint, typecheck and tests (what CI runs)
```

Tests import workspace packages from their TypeScript sources through the `lsc-source`
export condition, so no build is needed before testing. `pnpm build` emits `dist/`.

`mermaid-lsc` code that touches Mermaid internals lives in
`packages/mermaid-lsc/src/mermaid-adapter.ts`, so it can be swapped for in-tree
equivalents when the diagram is ported into Mermaid.

## Licence

MIT
