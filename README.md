# Live Sequence Charts for Mermaid

Live Sequence Charts (Damm & Harel, 2001) as a Mermaid diagram type. The design is in
[`docs/Live Sequence Charts for Mermaid — Proposal.md`](docs/Live%20Sequence%20Charts%20for%20Mermaid%20—%20Proposal.md).

Status: project skeleton. The grammar reads only the header, `title`, `accTitle` and
`accDescr`, and the renderer draws only the chart frame.

## Packages

| Package                               | Contents                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`lsc-model`](packages/lsc-model)     | DOM-free Langium parser, semantic model and (later) validator, unfoldings, partial order |
| [`mermaid-lsc`](packages/mermaid-lsc) | Mermaid external diagram: detector, loader, db, renderer, styles                         |

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
