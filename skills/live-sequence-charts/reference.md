# Live Sequence Charts: reference for writing charts

This is a complete reference for the `lsc-alpha` text notation, written for language models and
for readers who already know sequence diagrams. A gentler tutorial for people is at
<https://thomascothran.github.io/lsc-mermaid/tutorial/>.

A Live Sequence Chart (LSC; Damm & Harel, 2001) is a sequence diagram that says how strongly it
holds. It can say that something **may** happen (an example) or **must** happen (a rule), and
which steps of a rule are required and which may never come. Charts are plain text, drawn by a
Mermaid plugin, and checked by a validator.

## Contents

1. Choosing constructs
2. Chart layout
3. Statements
4. Meaning
5. Conditions and expressions
6. Placement, names and comments
7. Coming from Mermaid sequence diagrams
8. Diagnostics
9. Examples
10. Checking and showing charts

## 1. Choosing constructs

| The requirement says                                   | Write                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| "This can happen", a scenario, a use case, an example  | `lsc-alpha existential`                                                    |
| "Whenever X happens, Y must follow"                    | `lsc-alpha universal` with `activation on X` (a message) and Y as the body |
| "Whenever the system is in state S, …"                 | `activation when S` (a condition)                                          |
| "Once A, then B, then C have happened, D must follow"  | A `prechart` holding A, B, C; the body holds D                             |
| "A must never be followed by B"                        | A `prechart` holding A then B, and a body of `condition x: false`          |
| "After this point, the rest may not happen"            | `cold progress` on the instances that may stop                             |
| "If this message is sent, it may get lost"             | `cold` before the message                                                  |
| "At this point, S must be true"                        | `condition inst: S` (hot: the rule is broken if false)                     |
| "Only if S, carry on; otherwise this rule is finished" | `cold condition inst: S` (false ends the chart or the subchart quietly)    |
| "Either P or Q happens, depending on S"                | `if inst: S` … `else` … `end`                                              |
| "Repeat while S", "retry until", "for each"            | `subchart repeat *` whose first statement is `cold condition …: S`         |
| "Do this n times"                                      | `subchart repeat 3`, or `repeat n` with `var n: int`                       |
| "These may happen in any order"                        | `coregion inst` … `end` (events on that one instance)                      |
| "These happen at the same moment"                      | `simultaneous inst` … `end`                                                |
| "A message from or to the outside world"               | `env` as an endpoint                                                       |
| "Fire and forget", queued, asynchronous                | `-)` arrow; `->>` is synchronous (a hand-over)                             |
| "Meanwhile, X must not happen"                         | `visible` X: a watched message that has no place in the chart              |
| Something is created or shut down partway through      | `create x by y`, `destroy x`                                               |
| A timer expires                                        | `timeout inst: label`                                                      |
| Commentary with no meaning                             | `note over a, b: text`                                                     |

A universal chart needs a trigger (`activation on`, `activation when` or a `prechart`).
Without one it applies at every moment of every run, which is almost never meant (warning
`V11`).

## 2. Chart layout

```
lsc-alpha universal | existential | subchart     header: always the first line
  title …                                        declarations, before the first body statement
  defaults cold
  accTitle: … / accDescr: …
  instance … / participant … / actor …
  var …
  visible …
  activation when … / activation on …
  prechart                                       optional; universal or existential only
    …
  end
  …                                              the body: messages, conditions, blocks
```

One statement per line. Indentation is ignored. Blocks close with `end`. The mode word on the
header is required. `lsc` is accepted for `lsc-alpha`. A chart with the `subchart` header is a
reusable fragment: it has no `activation` and no `prechart`.

## 3. Statements

`temp` is an optional `hot` or `cold` prefix. `insts` is a comma-separated list of instances.

| Statement            | Syntax                                                                          | Example                                      |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| Title                | `title` text                                                                    | `title Car departure`                        |
| Accessibility        | `accTitle:` text, `accDescr:` text, `accDescr {` … `}`                          | `accDescr: Departure handshake`              |
| Defaults             | `defaults` (`hot` \| `cold`)                                                    | `defaults cold`                              |
| Instances            | (`instance` \| `participant` \| `actor`) id \[`as` label\] {`,` …}              | `instance car as "Car", carHandler`          |
| Variable             | `var` \[inst`.`\]name `:` type                                                  | `var car.mode: {pass, stop}`                 |
| Visible event        | `visible` \[`send` \| `receive`\] message                                       | `visible car ->> carHandler: arrivReq`       |
| Activation condition | `activation when` expr                                                          | `activation when car.idle`                   |
| Activation message   | `activation on` \[`send` \| `receive`\] message                                 | `activation on env ->> car: setDest`         |
| Pre-chart            | `prechart` … `end`                                                              | see the examples                             |
| Message              | \[temp\] from arrow to `:` label                                                | `cold car -) cruiser: start(90)`             |
| Send                 | \[temp\] `send` \[`#`tag\] from arrow to `:` label                              | `send #first client -) server: data`         |
| Receive              | `receive` \[`#`tag\] inst `from` inst `:` label                                 | `receive #first server from client: data`    |
| Condition            | \[temp\] `condition` insts `:` (expr \| "text")                                 | `cold condition car, proxSensor: cruising`   |
| Location temperature | (`hot` \| `cold`) `progress` insts                                              | `cold progress car, carHandler`              |
| Coregion             | `coregion` inst … `end`                                                         | `coregion car`                               |
| Simultaneous region  | `simultaneous` insts … `end`                                                    | `simultaneous controller`                    |
| Subchart             | `subchart` \["name"\] \[`over` insts\] \[`repeat` (`*` \| int \| var)\] … `end` | `subchart "Retry" over a, b repeat *`        |
| Local instance       | `instance` … inside a `subchart`, `if` or `else`                                | `instance scratch`                           |
| If-then-else         | `if` \["name"\] insts `:` (expr \| "text") … \[`else` \["name"\] …\] `end`      | `if car: mode = stop`                        |
| Create               | `create` id \[`as` label\] `by` inst                                            | `create carHandler as "Handler" by terminal` |
| Destroy              | `destroy` inst                                                                  | `destroy carHandler`                         |
| Timeout              | `timeout` inst `:` label                                                        | `timeout car: tm(90)`                        |
| Note                 | `note` (`over` insts \| `left of` inst \| `right of` inst) `:` text             | `note right of car: waits here`              |

- **Arrows.** `->>` is synchronous (filled head: sender and receiver hand over together). `-)` is
  asynchronous (open head: the receipt may come later). There are no other arrows and no reply
  arrows. A dashed line means cold, so write `cold a ->> b: m`, never `a -->> b: m`.
- **Message labels.** The label runs to the end of the line. Its name is the label without a
  trailing `(…)`: `start(90)` has the name `start`. Names identify events: `visible`, pre-chart
  matching and `receive` pairing compare names.
- **Split messages.** `a ->> b: m` is a send immediately followed by its receipt. To put other
  events between them, write `send a -) b: m` and later `receive b from a: m`. A `receive`
  pairs with the earliest unmatched `send` of that name between those instances, or with the
  `send` that has the same `#tag`. Keep a split pair in one block. They can't involve `env`.
- **Instances** may be declared, or appear on first use in a message. `participant` is the
  same as `instance`; `actor` draws a stick figure. A label is quoted, or, when the line
  declares only one instance, the rest of the line: `participant monitor as Plant monitor`.
- **`env`** is the environment: anyone the chart doesn't name. It's drawn at the frame edge.
- **Types** for `var`: `bool`, `int`, `int[0..9]` and enumerations `{idle, busy}`. A variable
  is global, or belongs to an instance (`var car.mode: …`). Types are optional, and enable
  checking.

## 4. Meaning

**Mode.** An existential chart says that at least one run of the system goes like this. A
universal chart says that every time its trigger occurs, the run must go like this.

**Order.** Each instance's events happen in the order they are written. Between instances,
only messages create order: a receipt comes after its send. Two events on different instances
with no chain of messages between them are unordered, even though one is written first.
Shared conditions and block boundaries also synchronise their instances.

**Temperature** means different things on different elements. Elements are hot unless marked
`cold`, or unless the chart says `defaults cold`.

| Element   | Hot                                           | Cold                                           |
| --------- | --------------------------------------------- | ---------------------------------------------- |
| Location  | The instance must move past this point        | The run may stop here                          |
| Message   | If sent, it must be received                  | It may be lost                                 |
| Condition | Must be true; if false, the chart is violated | If false, the chart (or subchart) ends quietly |

- A **location** is a point on an instance's line where it sends, receives, checks a condition
  or times out. A hot message does not have to be sent: whether it is sent depends on the
  temperature of the sender's location before it.
- **`progress`** sets the temperature of the instance's current location and of each later one,
  until the next `progress` for that instance or the end of the enclosing block. The top of an
  instance's line counts as a location, so a `progress` before any of its events covers the
  whole line.
- **The last location of every instance is cold**, whatever is written. `hot progress` on an
  instance with nothing left to do is an error (`V2`).
- **Trigger.** `activation on` names a message. The chart starts when it is received, or sent
  with `activation on send …`. It is drawn above the frame and is not required to happen.
  `activation when` starts the chart when a condition holds. The two can be combined, and with
  a `prechart`.
- **Pre-chart.** The body is required only once the pre-chart has been seen in full. If the run
  goes another way, the chart simply doesn't apply. A pre-chart has no temperatures.
- **Watched events.** While a chart runs, each of its events may occur only in its place: a
  message of the chart that comes out of order breaks a universal chart. `visible` adds
  watched events that have no place, so they can't occur at all while the chart runs.
  Messages the chart doesn't mention may happen at any time.
- **Blocks** (`subchart`, each `if` and `else` branch, each `repeat` iteration) start and end
  together for all their instances. A block's instances are its `over` list, the instances used
  inside it and its local instances. A false cold condition exits the innermost block.
- **`if … else`** evaluates its condition once, as a cold condition, and runs exactly one
  branch. Two subcharts guarded by `c` and `not c` are not the same: each guard is evaluated
  separately, so both or neither may run.
- **`repeat *`** runs until a cold condition inside it is false. `repeat n` reads `n` once.
- **`coregion inst`** lets its events on that instance happen in any order. Everything before
  it comes first, and everything after it comes after.
- **`simultaneous`** makes the region's events one location on each listed instance. Events on
  other instances stay separate.
- **Lifetimes.** `create x by y` starts `x` with a "new" arrow from `y`. `destroy x` ends it.
  `x` may be created again after it is destroyed.
- **Timeouts** are locations on their instance, with no timing meaning. **Notes** have no
  meaning at all and create no location.

## 5. Conditions and expressions

A condition is an expression or a quoted string:

- **Literals:** `true`, `false`, integers, enumeration values.
- **References:** `inst.var`, an unqualified `var`, or a dotted path such as
  `car.stopsAt.isEmpty`, kept as an opaque reference.
- **Operators:** `= != < <= > >= + - * / and or not` and parentheses. Tightest to loosest:
  `* /`, `+ -`, comparisons, `not`, `and`, `or`. Comparisons don't chain.
- **Shorthand:** a bare enumeration value means `var = value`, so `condition car: idle` means
  `car.state = idle` when `state` is the only variable with that value. A bare `bool` variable
  means `var = true`.
- **Quoted text,** such as `"queue is empty"`, is a proposition that is drawn but not checked.
  Use it for conditions outside the expression language, such as anything with `->`.
- **Bare names** that match no variable are named propositions. When the chart declares
  variables, that draws warning `V20`, as it is usually a typo.

An unqualified variable resolves against the condition's instances first, then against global
variables. `activation when` names no instances, so it sees global variables only.

## 6. Placement, names and comments

| Context                  | Allowed                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart body               | every body statement except instance declarations                                                                                           |
| `prechart`               | messages, `send`, `receive`, conditions, `coregion`, `simultaneous`, `timeout`, `create`, `destroy`, `note`; no `hot`, `cold` or `progress` |
| `subchart`, `if`, `else` | every body statement, nested blocks and local `instance` declarations                                                                       |
| `coregion`               | messages, `send`, `receive`, conditions, timeouts and `simultaneous`, all on its instance                                                   |
| `simultaneous`           | messages, `send` and `receive` touching the listed instances, and at most one condition                                                     |

- Declarations come before the first body statement and the `prechart`.
- Keywords are contextual, so most of them can also be names. Quote a name that clashes, for
  example `participant "end" as "End"`. `env` is always the environment.
- `%%` starts a comment, which must be a whole line.
- Words in use: `lsc lsc-alpha universal existential subchart title defaults instance
participant actor as var visible activation when on prechart end hot cold progress send
receive from condition coregion simultaneous over repeat if else create by destroy timeout
note left right of env true false and or not bool int`. Reserved for later: `forbidden
symbolic assign within delay sync initial invariant iterative ref sent received`.

## 7. Coming from Mermaid sequence diagrams

The header replaces `sequenceDiagram`. `participant`, `actor`, `as`, `->>`, `-)`, `note` and
`%%` work as in Mermaid. Everything else is different:

| Mermaid                                                                                   | LSC                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `-->>`, `--)` (replies)                                                                   | `->>`, `-)`; add `cold` if the message may be lost                                                                                              |
| `->`, `-->`, `-x`, `--x`, `<<->>`                                                         | `->>` or `-)`                                                                                                                                   |
| `alt c` … `else` … `end`                                                                  | `if inst: c` … `else` … `end`                                                                                                                   |
| `opt c` … `end`                                                                           | `subchart` whose first statement is `cold condition inst: c`                                                                                    |
| `loop` … `end`                                                                            | `subchart repeat *` with a cold condition, or `repeat n`                                                                                        |
| `par` … `and` … `end`                                                                     | `coregion inst` for one instance's events; otherwise just write them, as events on different instances are unordered unless messages order them |
| `critical`, `break`                                                                       | conditions: hot `condition` must hold; `cold condition` leaves the block                                                                        |
| `rect`, `box`, `autonumber`, `activate`, `deactivate`, `+`/`-` on arrows, `link`, `links` | not supported; remove them                                                                                                                      |
| `create participant x`                                                                    | `create x by y`                                                                                                                                 |
| `destroy x`                                                                               | `destroy x`                                                                                                                                     |

## 8. Diagnostics

Each diagnostic has a severity, a code and a position: `file:line:column: severity code:
message`. Codes marked **blocking** stop the chart from being drawn; with any other diagnostic
the chart is still drawn. An error means the chart breaks a rule of the notation. A warning means
it is valid but probably doesn't say what was meant. Info is commentary only.

| Code         | Severity | Problem and usual fix                                                                                                            |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `syntax`     | blocking | Unknown statement, missing `end`, statement in the wrong place (section 6), or a Mermaid keyword (section 7)                     |
| `V1`         | error    | The order has a cycle, for example through shared conditions or barriers. Reorder or split the events                            |
| `V2`         | error    | `hot progress` for an instance with no later event. Remove it, or add the event                                                  |
| `V3`         | error    | Two conditions at one location. Merge them with `and`                                                                            |
| `V4`         | error    | More than one `activation on` or `activation when`. Combine into one, or use a `prechart`                                        |
| `V5`         | error    | Text order contradicts the message order, for example a synchronous sender acting between its `send` and `receive`               |
| `V6`         | blocking | A condition, block, `receive`, `create … by`, `destroy` or `note` names an unknown instance. Declare it, or fix the name         |
| `V7`         | error    | A subchart's `over` list misses an instance used inside it. Add it, or drop the `over` list                                      |
| `V8`         | error    | An instance used before `create` or after `destroy`, or created while still alive                                                |
| `V9`         | error    | A `coregion` with fewer than two events, or with events on another instance                                                      |
| `V10`        | warning  | `repeat *` with no cold condition can only end by failing. Add `cold condition inst: …` at its start                             |
| `V11`        | warning  | A universal chart with no trigger applies at every moment. Add `activation on`/`when` or a `prechart`, or make it existential    |
| `V12`        | error    | `hot`, `cold` or `progress` inside a `prechart`. Remove them                                                                     |
| `V13`        | error    | A condition doesn't type-check against the declared variables, or an unqualified variable is ambiguous. Qualify it as `inst.var` |
| `V14`        | info     | A synchronous message to or from `env` adds no ordering                                                                          |
| `V15`        | info     | Synchronous sends in a coregion or simultaneous region are ordered only before what follows the region                           |
| `V16`        | info     | A message name is used more than once; each occurrence gets its own id                                                           |
| `V17`        | error    | `repeat var` with a variable that isn't a declared `int`                                                                         |
| `V18`        | blocking | A `send` without exactly one matching `receive`, or the reverse, or a repeated `#tag`                                            |
| `V19`        | error    | `send` or `receive` with `env`. Use a one-line message                                                                           |
| `V20`        | warning  | A bare name in a condition matches no declared variable: a typo, or quote it as a proposition                                    |
| `V21`        | warning  | A split `send` and its `receive` are in different blocks                                                                         |
| `V22`        | blocking | The header lacks its mode. Write `lsc-alpha universal`, `existential` or `subchart`                                              |
| `V23`        | blocking | A Mermaid arrow such as `-->>`. Use `->>` or `-)`, with `cold` for a dashed line                                                 |
| `V24`        | error    | Mermaid's `create participant x`. Write `create x by y`                                                                          |
| `V25`        | error    | `activation on send` from `env`. Name the sender, or drop `send`                                                                 |
| `V26`        | error    | An instance listed on `simultaneous` has no event in the region                                                                  |
| `V27`        | error    | A chart with the `subchart` header has an `activation` or a `prechart`                                                           |
| `unfoldings` | warning  | The chart has too many paths to check them all; checks that need every path were cut short                                       |

Read a message to the end: many show the corrected form.

## 9. Examples

A rule with a trigger message. Whenever the car receives `setDest`, the handshake must follow:

```lsc
lsc-alpha universal
  title Car departure
  instance cruiser, car, carHandler
  activation on env ->> car: setDest

  car ->> carHandler: departReq
  carHandler ->> car: departAck
  car ->> cruiser: start
  cruiser ->> car: started
  car ->> cruiser: engage
```

An example of what can happen:

```lsc
lsc-alpha existential
  title Checkout with a saved card
  actor shopper as "Shopper"
  participant shop as "Shop", bank as "Bank"

  shopper ->> shop: checkout
  shop -) bank: charge(card)
  bank -) shop: approved
  shop ->> shopper: receipt
```

A pre-chart with cold locations. Once both messages have been seen, the car must request
arrival, and after that the acknowledgement may never come:

```lsc
lsc-alpha universal
  title Perform approach
  instance proxSensor, car, carHandler

  prechart
    carHandler ->> car: departAck
    proxSensor ->> car: alert100
  end

  car ->> carHandler: arrivReq
  cold progress car, carHandler
  carHandler ->> car: arrivAck
```

A forbidden scenario. An arrival request must never follow a departure request:

```lsc
lsc-alpha universal
  title No arrival request while departing
  instance car, carHandler

  prechart
    car ->> carHandler: departReq
    car ->> carHandler: arrivReq
  end

  condition car: false
```

Typed variables, a retry loop and a choice:

```lsc
lsc-alpha universal
  title Upload with retries
  participant client as "Client", server as "Server"
  var client.attempts: int[0..3]
  var server.status: {ok, busy}
  activation on env ->> client: upload(file)

  subchart "Retry" over client, server repeat *
    cold condition client: attempts < 3
    client -) server: put(file)
    server -) client: reply(status)
    cold condition server: busy
  end

  if server: ok
    client -) env: done
  else
    cold client -) env: gave up
  end
```

Watching for a message the chart doesn't draw. No refund may go through while an order is
served:

```lsc
lsc-alpha universal
  title No refunds mid-order
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  visible barista ->> till: refund
  activation on customer ->> barista: order(latte)

  barista ->> till: ring up(latte)
  customer ->> till: pay
  barista ->> customer: latte
```

A common mistake: a Mermaid reply arrow, and no trigger. The checker reports both, with the
fixes:

```lsc expect=error
lsc-alpha universal
  title Ping
  client ->> server: ping
  server -->> client: pong
```

## 10. Checking and showing charts

- **Check** every chart before showing it: `npx -y mermaid-lsc@latest --check chart.lsc`, or
  `npx -y mermaid-lsc@latest --check notes.md` for the ` ```lsc ` blocks of a Markdown file. It
  prints `file: ok` or the diagnostics, and exits with 1 if any chart has an error. Fix errors,
  and fix warnings unless the chart is meant to show them. It needs Node 20 or later. Where the
  package is installed, `mermaid-lsc --check …` is enough.
- **Draw** a chart to SVG: `npx -y mermaid-lsc@latest chart.lsc -o chart.svg`.
- **Open** it in the browser playground, where the reader can edit it:
  `https://thomascothran.github.io/lsc-mermaid/#t=` followed by the chart text as UTF-8,
  base64url-encoded. Without a way to encode it, give the chart text and the link
  <https://thomascothran.github.io/lsc-mermaid/> to paste it into.
- **In Markdown,** write charts in ` ```lsc ` blocks. On pages that load the Mermaid plugin, use
  ` ```mermaid ` blocks instead.
- **Explain** a chart to someone new to LSCs by pointing them to the tutorial lesson for the
  construct: `https://thomascothran.github.io/lsc-mermaid/tutorial/` plus one of
  `06-can-happen-versus-must-happen.html` (modes), `07-when-does-a-rule-apply.html`
  (activation), `08-setting-the-scene.html` (pre-charts), `09-must-the-story-carry-on.html`
  (cold locations), `10-must-a-message-arrive.html` (cold messages),
  `11-facts-and-checks.html` (conditions), `12-saying-never.html` (forbidden scenarios),
  `13-chapters.html` (subcharts), `14-repeating.html`, `15-choices.html`,
  `16-any-order-and-the-same-moment.html` (coregions and simultaneous regions),
  `17-arrivals-and-departures.html` (create, destroy, timeouts),
  `18-watching-without-showing.html` (visible events) or `20-when-the-page-complains.html`
  (diagnostics).
