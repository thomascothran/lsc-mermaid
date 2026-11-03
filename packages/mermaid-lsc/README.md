# mermaid-lsc

[Live Sequence Charts](https://thomascothran.github.io/lsc-mermaid/tutorial/) (Damm & Harel, 2001) as a [Mermaid](https://mermaid.js.org) diagram type, with a command-line renderer and
checker. An LSC is a sequence diagram that says what may happen and what must happen.

```
lsc-alpha universal
  title Car departure
  activation on env ->> car: setDest
  car ->> carHandler: departReq
  carHandler ->> car: departAck
```

Try it in the [playground](https://thomascothran.github.io/lsc-mermaid/), or learn the notation
from the [tutorial](https://thomascothran.github.io/lsc-mermaid/tutorial/).

## Command line

````sh
npx mermaid-lsc chart.lsc -o chart.svg          # draw a chart as SVG
npx mermaid-lsc --check chart.lsc notes.md      # check .lsc files and the ```lsc blocks of Markdown
npx mermaid-lsc --link chart.lsc                # a link that opens the chart in the playground
npx mermaid-lsc --automaton chart.lsc           # the chart's skeleton automaton as JSON
````

Diagnostics go to standard error as `file:line:column: severity code: message`. `--check` exits
with 1 if any chart has an error; drawing exits with 1 on errors that stop rendering.
`npx mermaid-lsc --help` lists every option.

## In a page

```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs';
  import lsc from 'https://cdn.jsdelivr.net/npm/mermaid-lsc/dist/mermaid-lsc.esm.mjs';
  await mermaid.registerExternalDiagrams([lsc]);
  mermaid.initialize({ startOnLoad: true });
</script>
```

With a bundler, `import lsc from 'mermaid-lsc'`. Mermaid 12 is a peer dependency. From Node,
`import { renderSvg } from 'mermaid-lsc/node'` renders a chart to SVG inside jsdom.

The [project README](https://github.com/thomascothran/lsc-mermaid#readme) covers configuration,
theming and the notation's parser, [`lsc-model`](https://www.npmjs.com/package/lsc-model).

## For language models

The notation reference for language models is published at
<https://thomascothran.github.io/lsc-mermaid/llms.txt>, and as an Agent Skill in
[`skills/live-sequence-charts`](https://github.com/thomascothran/lsc-mermaid/tree/master/skills/live-sequence-charts).

## Licence

MIT
