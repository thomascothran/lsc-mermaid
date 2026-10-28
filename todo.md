# To do

## Tutorial: writing Live Sequence Charts

A step-by-step tutorial for readers with no technical background. It assumes no knowledge of
Mermaid, message sequence charts or UML. Each lesson adds one idea, and later lessons rely only
on earlier ones.

### Decisions

- **Running example:** a café order with a customer, a barista and a till. The same scenario
  grows through the tutorial. The paper's rail car appears only in the final lesson (Fig. 10).
- **Where it lives:** tutorial pages on the published site. Charts are drawn live in each page,
  and each has a "Try it" link that opens it in the playground.
- **Exercises:** every exercise has a model answer, hidden until the reader chooses to reveal
  it.

### How each lesson works

- **Idea first, syntax second.** Start with a picture and a plain question, such as "who has to
  wait?". Show the text that draws the picture only after that.
- **Plain words before terms.** "Column" comes before "instance", and "must/may" comes before
  "hot/cold". Give the proper name once the idea is clear.
- **One running example**, with a "Try it" link for every chart.
- **End with a small change to try and one question** to check understanding, each with a
  model answer the reader can reveal.

### Part 1: Telling a story

No rules yet. A chart is a picture of something that happened.

- [x] 1. **Who and when.** Each column is a participant, time runs down the page, and an arrow
      is a message. A first chart three lines long. Read the first line,
      `lsc-alpha existential`, as "here is one way things can go"; lesson 6 explains it.
- [x] 2. **Names and words.** Titles, display names (`as "Barista"`), message details
      (`order(latte)`), notes and `%%` comments.
- [x] 3. **What comes before what.** Events on one line happen in order. Between two lines, only
      arrows create order, so two people acting independently have no order relative to each
      other. A chart is a set of "this comes before that" facts, not a single timeline.
- [x] 4. **Waiting or not.** `->>` is a hand-over, where both sides act at once. `-)` is posting
      a letter: the sender carries on. Then letters that take time to arrive, with `send` and
      `receive` written separately, including crossing and overtaking letters.
- [x] 5. **The outside world.** `env` stands for anyone outside the chart, such as a customer
      walking in.

### Part 2: From stories to rules

The core idea of Live Sequence Charts.

- [x] 6. **"Can happen" versus "must happen".** An `existential` chart is a possible example and
      has a dashed frame. A `universal` chart is a rule and has a solid frame.
- [x] 7. **When does a rule apply?** A trigger message (`activation on`) or a trigger condition
      (`activation when`). A rule with no trigger applies all the time, and the page warns about
      that.
- [x] 8. **Setting the scene.** A `prechart` means "once this has happened, then this must
      follow". It is drawn as a hexagon frame.
- [x] 9. **Must the story carry on?** Each point on a participant's line is hot (the story must
      move past it) or cold (it may stop there). `cold progress`, and why every line's last point
      is cold.
- [x] 10. **Must a message arrive?** Hot messages must arrive once sent and are drawn solid. Cold
      messages may get lost and are drawn dashed, as long as the receiver's line is cold. Also
      `defaults cold`, and the temperature-cue setting for readers who can't easily tell dashes
      apart.
- [x] 11. **Facts and checks.** Variables (`var`), conditions and simple expressions (`=`, `and`,
      `or`, `not`). A hot condition must be true at that point. If a cold condition is false,
      the story ends quietly and nothing is wrong.
- [x] 12. **Saying "never".** The forbidden-scenario idiom: a prechart describes the situation,
      followed by a condition that can never be true.

### Part 3: Shaping longer stories

- [x] 13. **Chapters.** Subcharts. Everyone in a subchart starts it together and finishes it
      together.
- [x] 14. **Repeating.** `repeat *` loops until a cold condition fails. `repeat 3` and `repeat n`
      repeat a fixed number of times.
- [x] 15. **Choices.** `if` … `else`.
- [x] 16. **Order doesn't matter, and the same moment.** `coregion` and `simultaneous`.
- [x] 17. **Arrivals and departures.** `create`, `destroy` and `timeout`, plus helpers that exist
      only inside one chapter.
- [x] 18. **Watching without showing.** `visible` events.

### Part 4: Putting it together

- [x] 19. **Reading the paper's full rail-car chart (Fig. 10)** one piece at a time.
- [x] 20. **When the page complains.** Reading errors and warnings, the common mistakes, and
      exporting and sharing charts.
