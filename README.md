# Live Sequence Charts for Mermaid

Live Sequence Charts (Damm & Harel, 2001) as a Mermaid diagram type. The design is in
[`docs/Live Sequence Charts for Mermaid — Proposal.md`](docs/Live%20Sequence%20Charts%20for%20Mermaid%20—%20Proposal.md).

Status: the model library (`lsc-model`) reads the full notation and builds the semantic model,
with validation, unfoldings, the partial order and JSON. The Mermaid plugin (`mermaid-lsc`)
renders every element of the notation, and its command-line renderer writes SVG. Neither
package is published yet.

## Packages

| Package                               | Contents                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| [`lsc-model`](packages/lsc-model)     | DOM-free Langium parser, semantic model, validator, unfoldings, partial order, JSON |
| [`mermaid-lsc`](packages/mermaid-lsc) | Mermaid external diagram: layout, renderer, styles; command-line SVG renderer       |

## Using the plugin in a page

```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs';
  import lsc from 'https://cdn.jsdelivr.net/npm/mermaid-lsc/dist/mermaid-lsc.esm.mjs';
  await mermaid.registerExternalDiagrams([lsc]);
  mermaid.initialize({ startOnLoad: true });
</script>

<pre class="mermaid">
lsc-alpha universal
  title Car departure
  activation on env ->> car: setDest
  car ->> carHandler: departReq
  carHandler ->> car: departAck
</pre>
```

With a bundler, `import lsc from 'mermaid-lsc'` instead; Mermaid 12 is a peer dependency.

Solid lines are mandatory (hot) and dashed lines provisional (cold). Arrowheads show
synchrony only: filled for `->>` (synchronous), open for `-)` (asynchronous). A dashed arrow
is a cold message, never a reply.

### Configuration

Set in `mermaid.initialize`. While the diagram is an external plugin, Mermaid drops the `lsc`
block and `lsc*` theme variables when they appear in front matter or `%%{init}%%`; Mermaid's
own settings, such as `theme`, work per chart as usual.

| `lsc` option        | Default  | Effect                                                                                   |
| ------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `showVisibleEvents` | `true`   | Show the "visible:" line in the header tab                                               |
| `temperatureCue`    | `'line'` | `'line+color'` fades cold elements; `'line+badge'` tags them with a "C"                  |
| `showDiagnostics`   | `true`   | Number the rows that have warnings or non-blocking errors, and list them under the chart |
| `rowHeight`         | `36`     | Minimum row height in pixels                                                             |
| `instanceSpacing`   | `40`     | Minimum gap between neighbouring head boxes in pixels                                    |
| `mirrorInstances`   | `false`  | Repeat the head boxes at the bottom                                                      |
| `useMaxWidth`       | `true`   | Scale the SVG to its container, up to its natural width                                  |

| Theme variable     | Default     | Colours                                        |
| ------------------ | ----------- | ---------------------------------------------- |
| `lscFrameColor`    | `lineColor` | Frames, tabs, coregions, creation and timeouts |
| `lscHotColor`      | `lineColor` | Hot lines, messages and conditions             |
| `lscColdColor`     | `lineColor` | Cold lines, messages and conditions            |
| `lscConditionFill` | `mainBkg`   | Condition hexagons                             |

Mermaid's hand-drawn look is not implemented: charts are drawn with plain lines in every
look, so dashed, dotted and solid lines stay distinguishable.

## Command-line renderer

For sites that render Mermaid without plugins, such as GitHub, render charts to SVG files and
embed them as images:

```sh
mermaid-lsc chart.lsc -o chart.svg
mermaid-lsc -t dark -c config.json chart.lsc > chart.svg   # config.json: mermaid.initialize options
```

It runs Mermaid with the plugin inside jsdom, so the SVG is the one Mermaid draws in a page.
Warnings go to standard error as `file:line:column: severity code: message`; errors that stop
rendering exit with status 1. The same renderer is available to scripts:

```ts
import { renderSvg } from 'mermaid-lsc/node';
const { svg, diagnostics } = await renderSvg(text, { config: { theme: 'forest' } });
```

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
the rules marked ✱ in the proposal (`isBlocking`). `parseLsc(text, { firstLine })` numbers
lines from `firstLine`, for text cut out of a larger document.

## Development

Requires Node 20+ and pnpm. On NixOS, `nix shell nixpkgs#pnpm` provides pnpm.

```sh
pnpm install
pnpm test               # generates the Langium parser, then runs Vitest
pnpm check              # format check, lint, typecheck and tests (what CI runs)
pnpm build              # dist/ for both packages, and the browser bundle
pnpm --filter mermaid-lsc demo   # live editor and all worked examples at http://localhost:4173/
```

Tests import workspace packages from their TypeScript sources through the `lsc-source`
export condition, so no build is needed before testing.

**Visual baselines.** Every fixture's SVG, rendered through Mermaid, is compared with
`packages/mermaid-lsc/test/baselines/<fixture>.svg`. After an intended rendering change, run
`pnpm baselines:update` and review `packages/mermaid-lsc/test/baselines/index.html` in a
browser before committing.

The layout (`packages/mermaid-lsc/src/layout.ts`) is DOM-free and estimates text widths from
a fixed table, so it gives the same result in a browser, in jsdom and in tests. Code that
touches Mermaid internals lives in `packages/mermaid-lsc/src/mermaid-adapter.ts`, so it can be
swapped for in-tree equivalents when the diagram is ported into Mermaid.

## Licence

MIT
