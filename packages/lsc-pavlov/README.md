# lsc-pavlov

Runs a Live Sequence Chart as a [pavlov](https://github.com/thomascothran/pavlov) b-thread.
pavlov's model checker can then check a behavioural program against the chart.

The semantics live in `lsc-model`. It turns a basic chart into its skeleton automaton, and this
library only interprets that automaton. See "Skeleton automaton and pavlov" in the
[proposal](../../docs/Live%20Sequence%20Charts%20for%20Mermaid%20—%20Proposal.md).

It runs on the JVM, in ClojureScript and in Babashka.

## Install

Add it as a git dependency, with `:deps/root "packages/lsc-pavlov"`. It brings in pavlov, pinned
to a commit.

## Use

Write the chart's automaton as JSON:

```sh
mermaid-lsc --automaton car-departure.lsc -o car-departure.json
```

Then run it in pavlov:

```clojure
(require '[lsc.pavlov :as lp]
         '[tech.thomascothran.pavlov.model.check :as check])

(def departure (lp/read-automaton (slurp "car-departure.json")))
(def stopping (lp/read-automaton (slurp "car-stopping.json")))

(check/check
  {:bthreads (assoc program :car-stopping (lp/bthread stopping {:name "car-stopping"}))
   :safety-bthreads {:car-departure (lp/bthread departure {:name "car-departure"})}
   :possible #{:car-stopping/completed}})
```

- **Universal charts** go in `:safety-bthreads`.
  - An event out of order, or a false hot condition, requests
    `{:type :car-departure/violated, :invariant-violated true, :reason …}`.
  - While the chart has a promise to keep, its bids are `:hot`. A run that stops or loops
    before keeping the promise is reported as a liveness violation.
- **Existential charts** request `:car-stopping/completed` when they are carried out. Use
  `:possible` to ask for them.

## Events

By default the chart expects these pavlov event types:

| Message                                               | Event type                    |
| ----------------------------------------------------- | ----------------------------- |
| A synchronous message `car ->> carHandler: departReq` | `:car->carHandler/departReq`  |
| The send of an asynchronous message                   | `:car->carHandler/departReq!` |
| The receipt of an asynchronous message                | `:car->carHandler/departReq?` |

A message from the environment has the sender `env`. To map chart events to your program's
event types, pass `:event-type`, a function of `{:from :to :name :kind :dir}`.

## Options

| Option        | Default                                         | Meaning                                                                                      |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `:name`       | the title, lower-cased and hyphenated, or `lsc` | The namespace of the b-thread's own events                                                   |
| `:event-type` | `lp/default-event-type`                         | Maps a chart event to a pavlov event type                                                    |
| `:conditions` | none                                            | A map from a condition's id (`"c1"`) or text to a predicate of `{:condition :event :events}` |
| `:mode`       | `:monitor`                                      | `:enforce` also blocks the events that would break a universal chart                         |

A condition that has neither a predicate nor a constant value becomes a choice. The b-thread
requests `{:type <name>/condition, :condition id, :value true}` and the same event with `false`,
and the model checker explores both.

## Tests

```sh
clojure -X:test
```

The tests model-check every fixture that the automaton supports. They read the automata in
`test/resources/automata/`. Regenerate those with `pnpm automata:update` from the repository
root.

## Licence

Eclipse Public License 1.0, like pavlov and Clojure. See `LICENSE`.
