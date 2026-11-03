# lsc-model

Parser, semantic model and validator for
[Live Sequence Charts](https://thomascothran.github.io/lsc-mermaid/tutorial/) (Damm & Harel, 2001) in the `lsc-alpha` text notation. It needs no DOM, and never throws on bad input. The
Mermaid plugin, [`mermaid-lsc`](https://www.npmjs.com/package/mermaid-lsc), draws the charts.

```ts
import { parseLsc, validateLsc, unfoldings, partialOrder, toJSON } from 'lsc-model';

const { model, diagnostics } = parseLsc(text);
if (model) {
  diagnostics.push(...validateLsc(model));
  const order = partialOrder(model);
}
```

- `parseLsc(text, { firstLine })` returns the model and the diagnostics tied to the source text.
  `model` is `undefined` when the chart can't be laid out (`isBlocking`).
- `validateLsc(model)` checks the rules that need the unfoldings and the partial order.
- `unfoldings`, `partialOrder` and `toJSON` give the chart's structure.
- `skeletonAutomaton(model)` gives the state machine of a basic chart, which
  [pavlov](https://github.com/thomascothran/pavlov) can run as a monitor.

Every diagnostic has a severity, a stable code (`syntax`, `V1`–`V27`, `unfoldings`), a message
and a span. The [proposal](https://github.com/thomascothran/lsc-mermaid/tree/master/docs) gives
the notation, its semantics and every validation rule.

## Licence

MIT
