---
name: live-sequence-charts
description: Read, write, check and show Live Sequence Charts (LSCs) in the `lsc-alpha` text notation, a Mermaid diagram type for sequence diagrams that say what may and what must happen. Use when a user shares or asks for an LSC or an `lsc-alpha` chart, or wants requirements, protocols, rules or scenarios written down as charts that both people and agents can read and check.
---

# Live Sequence Charts

An LSC is a sequence diagram with modality: an existential chart shows what can happen, and a
universal chart states a rule that must hold whenever its trigger occurs. Charts are plain
text, so the person and the agent can both edit the same chart.

## Workflow

1. **Load the notation.** Read [reference.md](reference.md) before writing or changing a chart.
   Section 1 maps requirement phrases to constructs, and section 7 lists the Mermaid habits
   that don't carry over.
2. **Write the chart** in a ` ```lsc ` block in your reply, or in a `.lsc` file when working in a
   repository. Start with `lsc-alpha universal` for rules and `lsc-alpha existential` for
   examples. Give every universal chart a trigger.
3. **Check it** before showing it:

   ````sh
   npx -y mermaid-lsc@latest --check chart.lsc   # or a Markdown file: checks its ```lsc blocks
   ````

   This needs Node 20 or later and access to the npm registry. Where `mermaid-lsc` is installed
   (as in its own repository), `mermaid-lsc --check chart.lsc` is enough. Fix every
   error, and every warning the chart isn't meant to show; reference.md section 8 lists the
   codes and their usual fixes. If you can't run the checker, say that the chart is unchecked.

4. **Say what it means.** Under the chart, state its reading in plain words, one sentence per
   rule: "Whenever the car receives `setDest`, it must send `departReq` …; after `arrivReq`,
   the acknowledgement may never come." The person confirms the reading, not the syntax, so
   the reading is where misunderstandings show up.
5. **Let them see it drawn.** Give a link that opens the chart in the playground, drawn and
   editable:

   ```sh
   node scripts/link.mjs chart.lsc      # this skill's script: needs only Node, no packages
   ```

   Run it from this skill's folder, or give its full path. If the script isn't at hand, use
   `npx -y mermaid-lsc@latest --link chart.lsc`. Without any way to run code, write the link by
   hand as reference.md section 10 shows. Show the chart text as well as the link. An SVG from
   `npx -y mermaid-lsc@latest chart.lsc -o chart.svg` suits files and pull requests. For
   someone new to LSCs, also link the tutorial lesson for the construct that matters.

6. **When the person edits a chart,** re-check it, then describe how its meaning changed rather
   than how its text changed.

## Reading a chart someone gives you

Check it first, and report diagnostics before reasoning from it. Then read it as section 4 of
the reference says: solid means must, dashed means may, and events on different instances are
ordered only by messages. When the chart and the person's prose disagree, ask which one is
right.
