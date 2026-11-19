import type { ReactNode } from 'react';

const SURPRISES = [
  {
    title: 'The engine is the short part',
    body: "About two hundred lines: size the position, charge the fill, track the leg. I expected the loop to be where the difficulty lived. What ate the time was everything around it: normalising a feed, deciding what equity means on the bar where you enter, getting the axis tick and the crosshair to agree about where a price sits, handling a stop that gaps. The maths was never the problem. The edges were.",
  },
  {
    title: 'A stop loss is a price you hope for',
    body: "Exit five percent below entry, so write five percent. Fills do not work like that. If the market opens eight percent down you get the open, not your level. I wrote the gap case twice before it stopped feeling like a detail. It moves the numbers more than any parameter I tuned, and it is the first thing I check in someone else's backtester.",
  },
  {
    title: 'Drawing a candle is ten lines. Making the chart readable is the other four hundred',
    body: 'Ticks at intervals a human reads. A log scale that does not collapse at either end. Hit-testing that agrees with what is drawn, so the crosshair lands on the bar under the cursor and not the one beside it. I budgeted an afternoon for the chart and a week for the engine. It went the other way round, and I would budget it that way next time.',
  },
  {
    title: 'The best cell won out of sample by accident',
    body: 'The sweep fits on the first seventy percent of the sample and scores on the last thirty. The winning holdout cell scored 1.43 out of sample against 0.92 in sample. Doing better on data you were not fitted to is not clever, it is noise with a good haircut. That result did more to calibrate how much I trust backtests than anything I have read.',
  },
];

const MISTAKES = [
  {
    title: 'I filled at the close that generated the signal',
    body: 'Which is future data. The curve was beautiful, and that should have been the tell.',
    fix: 'signals read on a completed bar and fill at the next open. The old behaviour still exists, because an upper bound is useful when it is labelled, and it is labelled.',
  },
  {
    title: 'I drew a flat drawdown chart and believed it',
    body: 'I passed an array of zeros into the renderer while wiring the series. It drew axes, gridlines and a legend, and looked exactly like a strategy that never lost money. Nothing threw. I caught it because a perfectly flat line at zero is too good.',
    fix: 'equity and drawdown read from one series now, and the drawdown panel is the first thing I check when a result looks clean.',
  },
  {
    title: 'January was blank in every year of the monthly table',
    body: 'A month return needs the previous close. For January that is December, which lives in the previous row and not the current year. I never looked outside the year, so the column sat empty for three years and I did not notice.',
    fix: 'the last value of the prior year carries forward as the base.',
  },
  {
    title: 'The chart was breaking its own layout',
    body: 'Grid tracks size to content, and my SVG had an intrinsic width. The container grew to fit the chart, the chart measured the container, and they agreed on the wrong number. The chart was overflowing a column it had widened itself.',
    fix: 'min-width: 0 on the track and a resize fallback for the measurement. Two lines of fix, an hour of confusion, and a reminder that layout is a feedback loop, not a one-way pass.',
  },
  {
    title: 'I hand-wrote five years of financials, then deleted them',
    body: 'Twelve companies, five years, every line item. Unmaintainable, and it looked more precise than it was. I was inventing accuracy to fill a table.',
    fix: 'one anchor per company plus margins, statements derived from that, and a sentence on the page saying it is illustrative. The quality score still pins at 100 for the most profitable name. That clamp is a heuristic I have not earned, and it is the first thing I would fix.',
  },
  {
    title: 'My first sweep threw away the start of the holdout',
    body: 'I sliced the bar array and ran the holdout on the slice, so the indicator warmup ate the first months. The exact stretch the split existed to protect, measured on the least out-of-sample part of the sample.',
    fix: 'one full run, then split the equity curve by date.',
  },
];

const DEFEND = [
  {
    claim: 'A backtest with no costs is a drawing',
    pushback:
      'Your cost model is invented. You picked the basis points, you picked the per-ticket minimum, and you fill at the open with no market impact. Adding made-up numbers to made-up numbers does not make the result real.',
    answer:
      'That is correct. Those parameters are guesses. There is no impact model, no borrow, no partial fill. Ask what this strategy would net in the market and I do not know; the number on screen is not it. What the model buys is not accuracy, it is an ordering: turnover has to be paid for, so a strategy that trades four times as often has to earn it. I trust the comparison between two strategies, not the level of either. Only one of those claims is in the README.',
  },
  {
    claim: 'The honest fill is the default, not an option',
    pushback: 'Nobody deliberately uses future data.',
    answer:
      'Not deliberately. The optimistic path is the one that takes less work, and defaults are the product. Same-close fills still exist here, because an upper bound is useful, but you have to ask for it and the UI says you did.',
  },
  {
    claim: 'I would show you the holdout before the good number',
    pushback: 'A sweep is still cherry-picking. You just moved the cherries.',
    answer:
      'It is cherry-picking, and twenty-five trials inflate the maximum. That is why the decay sits next to the winner and the best in-sample configuration sits beside the best holdout. I am not trying to produce a good-looking number. I am trying to make the flattering one look suspicious on the way past.',
  },
  {
    claim: 'I labelled the fake data instead of hiding it',
    pushback: 'Then why ship fake fundamentals at all?',
    answer:
      'Because a demo that works with no API key is worth more than one that does not, and the label is the difference between a placeholder and a lie. The failure I am guarding against is the one this industry is full of: a number with no provenance that looks audited.',
  },
  {
    claim: 'The trade log belongs next to the equity curve',
    pushback:
      'That is a preference you dressed up as a principle. Putting the log on the same screen cost you half the width of the chart, and you have no evidence anybody reads it there. You are defending a layout you happen to like.',
    answer:
      'Half of that I will take. There is no evidence: one user, no test, no measurement, and the width cost is real, the chart is worse on a laptop because of it. What I have is that I stopped opening the log when it lived on its own tab, so I built the screen around my own laziness. I would defend the instinct that a number should show you its trades without a tab change. I would not defend this layout against a handful of people telling me they never looked at it, and if they did, I would move the log and keep the chart wide.',
  },
];

const NEXT = [
  'Walk-forward with purged folds, instead of one 70/30 cut.',
  'Portfolio ranking across the universe, so the watchlist means something.',
  'Borrow costs and dividends. They matter more than another indicator.',
  'Move the sweep into a worker so the grid can get wider without freezing the chart.',
];

const num = (i: number) => String(i + 1).padStart(2, '0');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h4 className="sec-title">{title}</h4>
      <div className="essay">{children}</div>
    </>
  );
}

export function Engineering() {
  return (
    <div className="notes">
      <header className="notes-head">
        <h3>Engineering notes</h3>
        <p>
          I built this because I got tired of taking backtests at face value. Someone shows me a curve, I ask how it
          fills, they say at the close, and the conversation is over. Writing one myself was the cheapest way to find out
          how much of that curve is the market and how much is the person who wrote it. None of this is the feature list.
          It is what changed how I review someone else&rsquo;s results.
        </p>
        <p className="pipeline-line">feed &rarr; signal &rarr; execution &rarr; analytics &rarr; render</p>
      </header>

      <Section title="What surprised me">
        {SURPRISES.map((s, i) => (
          <div className="note-item" key={s.title}>
            <h4>
              <span className="note-idx">{num(i)}</span>
              {s.title}
            </h4>
            <p>{s.body}</p>
          </div>
        ))}
      </Section>

      <Section title="What I got wrong">
        {MISTAKES.map((m, i) => (
          <div className="note-item" key={m.title}>
            <h4>
              <span className="note-idx">{num(i)}</span>
              {m.title}
            </h4>
            <p>{m.body}</p>
            <span className="fix">
              <b>What changed:</b> {m.fix}
            </span>
          </div>
        ))}
      </Section>

      <Section title="What I would defend in an interview">
        {DEFEND.map((d, i) => (
          <div className="note-item defend" key={d.claim}>
            <h4>
              <span className="note-idx">{num(i)}</span>
              {d.claim}
            </h4>
            <p className="pushback">
              <span className="role">The pushback</span>
              {d.pushback}
            </p>
            <p className="answer">
              <span className="role">My answer</span>
              {d.answer}
            </p>
          </div>
        ))}
      </Section>

      <h4 className="sec-title">What I would do with another week</h4>
      <ul className="open-list">
        {NEXT.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <p className="notes-foot">
        Written while building, not after. Every mistake above is one I made here, roughly in this order. Numbers come
        from the bundled reference snapshot or a feed you connect yourself.
      </p>
    </div>
  );
}
