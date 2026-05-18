# Post-chunk relabel: intra-chromosomal translocations

A post-chunk pass that re-labels chunks whose query-side order is inconsistent
with their base-side order, even though both sides are on the same chromosome.

## Scope

- Runs **after** `chunkRows` and never feeds back into chunking. It only updates
  chunk-level event labels (`chunk.dominant`) for visualization. Row-level
  fields and `eventCounts` are not mutated; `chunkRows` is not re-run.
- The existing row-level `isTranslocation` (different chromosome) is untouched.
- Operates **per pair**, on each maximal group of chunks where
  `chrBase === chrQuery`. Chunks whose chromosomes differ are out of scope.

## Definitions

Within one in-scope group:

- **Base order**: chunks sorted ascending by `bp1Base`. Ties (same `bp1Base`)
  are broken by the chunk's original index, so whatever comes first on the base
  row wins. Position in this order is the **base rank** `b_i`.
- **Query rank** `q_i`: the chunk's position when the same group is sorted
  ascending by `bp1Query` (ties again broken by original index).
- **Backbone**: forward chunks where `q_i === b_i`, i.e. the chunk sits at
  the same position in both the base and query orderings **and**
  `isInvert === false`. Inverted chunks at `q_i === b_i` (e.g. the middle
  of an odd-length inversion, or the first chunk of an inversion that
  starts at base position equal to the inversion's max query position) are
  positional matches by coincidence and are excluded from the backbone -
  treating them as backbone would slice an inversion block in two. Backbone
  chunks are never relabeled.
- **Run**: a maximal contiguous block of non-backbone chunks in base order.
- **Region**: a run, possibly split further by run refinement (see Algorithm).
  Labels are decided one region at a time.
- **Region orientation**: per region, "inverted" iff a strict majority of
  chunks in the region have `isInvert === true`; otherwise "forward".
- **Signed offset** for a chunk in a region. One formula per region, chosen by
  the region's orientation and applied uniformly to every chunk in it:
  - forward region:  `q_i - b_i`
  - inverted region: `-q_i - b_i`

  The `-q` form is "reversed query order beforehand" - a clean inverted block
  has uniform `-q-b` just as a clean synteny block has uniform `q-b`. Because
  the region picks one formula, "same offset" inside a region is a meaningful
  comparison across all of its chunks regardless of their individual
  `isInvert` flags.

## Algorithm

1. Group chunks by `(chrBase, chrQuery)` within the pair; keep only groups
   where `chrBase === chrQuery`. Skip groups with fewer than 2 chunks.
2. Sort by base order and compute `q`.
3. Mark chunks where `q[k] === k` **and** `isInvert === false` as the
   **collinear backbone** - their existing labels stand. Position-only
   matching, no longest-subsequence search. Inverted chunks that happen to
   land at `q[k] === k` are *not* backbone.
4. Walk the chunks in base order. Each maximal contiguous block of
   non-backbone chunks is a **run**.
5. **Run refinement**: for each run, count `isInvert` chunks.
   Forward-majority runs become a single region with no splitting. For
   inversion-major runs:
   1. Walk the inverted body (up to and including the last inverted
      chunk) in base order, anchoring on inverted chunks only: forward
      chunks inside the body neither anchor nor update the running max
      and they ride along in whatever sub-region the walk is currently
      building. The first inverted chunk seeds `maxQRank` and `minQRank`
      for the current sub-region; later inverted chunks update
      `minQRank` and cut the body open whenever `q[k] > maxQRank`
      (strict `>`), at which point the new chunk's `q` reseeds both. Each
      resulting piece is a **region**.
   2. After the last inverted chunk, look at the forward chunks before
      `runEnd`. Walk from the end backward and peel off the maximal
      suffix whose `q` is **outside** the last sub-region's
      `[minQRank, maxQRank]` - those are **non-intercepting** trailing
      forwards and become a separate **trailing-forward region**.
      Intercepting forwards (q inside that range) sit inside the
      inversion's query span and stay with the last sub-region.
6. For each region (re-evaluated independently of its parent run):
   1. Count `isInvert` chunks. If every chunk in the region is inverted,
      **skip the region** entirely - all chunks keep `inversion`
      regardless of how their offsets compare.
   2. Otherwise, pick the **region orientation** (inverted iff strict
      majority is inverted, otherwise forward).
   3. **In an inversion-major region, inverted chunks always keep
      `inversion`** - they are never relabeled. Only forwards are subject
      to relabeling, and only via the rules below. Sum `eventCounts.total`
      across the forward and inverted chunks separately:
      - `invEvents >= fwdEvents` (**flip-forwards** on): every forward
        chunk is immediately relabeled to `translocation` without
        consulting offsets - they are structurally out of place in an
        inverted block and their offsets can coincide with the
        inversion's line by chance.
      - `fwdEvents > invEvents`: the synteny block is the dominant signal
        by weight; flip-forwards is suppressed and forwards take part in
        the offset majority (inverted chunks still don't).
   4. Compute each remaining chunk's signed offset using the single region
      formula (forward `q-b` for forward regions, inverted `-q-b` for
      inverted regions). Inverted chunks in an inversion-major region
      contribute to the offset count when flip-forwards is off; when
      flip-forwards is on, only inverted chunks contribute (forwards are
      handled by the flip). In a forward region every chunk contributes.
   5. Pick the **majority offset** by **total `eventCounts.total`**
      across the chunks at each offset. On an event tie, the offset with
      more chunks wins; if still tied, the offset whose first chunk
      appears earliest in base order wins.
   6. Chunks whose offset equals the majority offset keep their existing
      label.
   7. Chunks whose offset does **not** equal the majority offset are
      relabeled based on their own `isInvert` flag, **except inverted
      chunks in inversion-major regions which always stay as
      `inversion`**:
      - `isInvert === false` -> `translocation`
      - `isInvert === true` in a forward region -> `translocation+inversion`
      - `isInvert === true` in an inversion-major region -> stays
        `inversion` (no relabel).

A region whose offsets are all identical (including a region of one chunk)
relabels nothing.

## Why region-local minority

Five over-relabel / under-relabel cases this avoids:

- Any inverted block surrounded by synteny: if every chunk in the region is
  inverted, the all-inversion shortcut skips the region outright, so
  inverted chunks always stay as `inversion` even when their offsets are
  not perfectly uniform.
- An inverted chunk with a stray offset inside an otherwise clean
  inversion-major region: the inversion-major rule keeps **all** inverted
  chunks as `inversion`, so internal offset variation (e.g. a single
  inverted chunk that doesn't quite line up with the others) is treated
  as noise rather than evidence of `translocation+inversion`.
- Translocated forwards mixed with an inversion: a translocated forward
  chunk can happen to sit on the inversion's offset line (`q + b` equal
  to the inversion's value), which would let it pass as backbone-aligned
  even though it isn't. The flip-forwards rule sidesteps this by
  deciding from orientation, not offset - but only when the inverted
  side carries at least as many events as the forward side. A region
  where syntenies outweigh inversions falls back to offset majority for
  everyone, since the inversion-major count alone shouldn't be enough to
  flip a heavier synteny block.
- A clean block translocation (a synteny or inverted block uniformly shifted):
  all chunks in the block share an offset under the region's formula, so the
  region keeps its existing labels.
- Two back-to-back inversions on the same chromosome: refinement keeps
  them as two distinct regions instead of merging into a single blob,
  so downstream consumers (e.g. visualization overlays) see two
  recognizable inversion units. Labeling is safe either way now (the
  inversion-major rule plus all-inversion shortcut keep every inverted
  chunk as `inversion`), but the region split preserves structural
  meaning.

Only chunks that break the local coherent shift get relabeled.

## Tie-breaking

All ties resolve to "earlier in base order wins", with one exception for
region orientation:

- Equal `bp1Base` -> the chunk with the lower original index gets the earlier
  base rank.
- Equal `bp1Query` -> same rule for query rank.
- Majority offset is decided by total `eventCounts.total` first, then by
  chunk count on event ties, then by first-chunk-in-base-order on count
  ties.
- Region orientation tie (equal inverted and non-inverted counts) defaults to
  forward; the inverted formula is only used when inverted is a strict
  majority.
- Flip-forwards gate uses `<=`: the rule applies when `invEvents` is at
  least `fwdEvents`. Only a strict win for forwards
  (`fwdEvents > invEvents`) suppresses the flip, so a tie still flips
  forwards to translocation.
- Run-refinement cut uses strict `>`: an inverted chunk cuts only when its
  `q` is strictly greater than the running max `q` of the current
  sub-region. An inverted chunk whose `q` ties the running max stays in
  the current sub-region. Forward chunks inside the inverted body never
  cut or update the max.
- The trailing-forward strip peels only **non-intercepting** forwards
  (q strictly outside the last sub-region's `[minQRank, maxQRank]`).
  Intercepting forwards stay with the last sub-region. The peel is a
  backward walk from `runEnd`, so it always emits a contiguous suffix.
  If the first chunk it walks back into is intercepting, no peel
  happens at all.

## Worked examples

### Example 1: clean inverted block next to synteny

Eight chunks on one chromosome; A-C and H are synteny, D-G are a clean
inverted block.

```
chunk:     A B C D E F G H
b_i:       0 1 2 3 4 5 6 7
q_i:       0 1 2 6 5 4 3 7
isInvert:  F F F T T T T F
```

- Positional matches (`q[k] === k`) at `k = 0, 1, 2, 7`. Backbone =
  `{0, 1, 2, 7}` (A, B, C, H).
- Non-backbone region = `{3, 4, 5, 6}` (D, E, F, G); all four chunks are
  inverted, so the all-inversion shortcut applies and the region is skipped.
- D-G keep `inversion`.

### Example 2: synteny with minority offset

Eleven synteny chunks in one region; all forward, so the region orientation is
forward and offsets are `q-b`:

```
+1  +1  +1  -8  -8  -8  +1  +1  +1  +1  -8
```

Majority offset `+1` wins (events 7 vs 4 under unit per-chunk weights;
count would also pick `+1`). The four chunks with offset `-8` get
relabeled `translocation`.

### Example 3: synteny chunk inside an inversion-major region

Run of five chunks at base ranks 3-7 (four inverted, one synteny in the
middle):

| k | isInvert | q (= bp1Query rank) |
| - | -------- | ------------------- |
| 3 | T        | 5                   |
| 4 | F        | 6                   |
| 5 | T        | 4                   |
| 6 | T        | 2                   |
| 7 | T        | 1                   |

The run is inversion-major (4T vs 1F). The last inverted chunk is at k=7,
so there is no trailing forward tail. Refinement walks the inverted body
anchoring on inverted chunks only: k=3 seeds `maxQRank = 5`, k=4 is
forward and is skipped, and k=5, 6, 7 have `q` 4, 2, 1, all `<= 5`, so no
cut fires. The run stays as one region.

Labeling. The region is inversion-major, so **every inverted chunk
(k=3, 5, 6, 7) keeps `inversion`** regardless of its offset - the
inversion-major rule never relabels inverteds. For the lone forward
chunk: with unit weights `invEvents = 4 >= fwdEvents = 1`, flip-forwards
is on and k=4 becomes `translocation`.

Final labels: k=3, 5, 6, 7 stay `inversion`; k=4 -> `translocation`.
Notice that k=5 has a different `-q-b` than the rest of the inverted
chunks (`-9` vs `-8`) but it still keeps `inversion` - the inversion-major
rule treats internal offset variation as inversion noise, not as a hint
to relabel.

### Example 4: two consecutive inversions

Eight chunks on one chromosome, all `isInvert = T`, forming two distinct
inverted blocks back-to-back. `bp1Query` (in rank space) goes
`3, 2, 1, 0, 7, 6, 5, 4`:

| k | isInvert | q | -q-b (whole run) |
| - | -------- | - | ---------------- |
| 0 | T        | 3 | -3               |
| 1 | T        | 2 | -3               |
| 2 | T        | 1 | -3               |
| 3 | T        | 0 | -3               |
| 4 | T        | 7 | -11              |
| 5 | T        | 6 | -11              |
| 6 | T        | 5 | -11              |
| 7 | T        | 4 | -11              |

No positional matches, so the whole thing is one non-backbone run.
Without refinement it would be one inverted region; with the
all-inversion shortcut (every chunk here is inverted), labels would
already be safe. Refinement still matters: it keeps the two blocks as
distinct regions for downstream consumers (e.g. visualization
overlays), so each block stays a recognizable unit instead of merging
into one eight-chunk blob.

Refinement prevents that. The last inverted chunk is at k=7 so there is no
trailing forward tail. `maxQRank` seeds at the first inverted chunk's `q=3`
and stays there for k=1..3 (all `q` values are below 3). At k=4, `q=7 > 3`
triggers a cut; the new sub-region seeds `maxQRank=7`, and k=5..7 stay
below it. Two regions, each all-inverted, both skipped by the all-inversion
shortcut. Both blocks keep their `inversion` labels.

### Example 5: trailing forward tail with non-intercepting forwards

Six chunks: a clean four-chunk inversion followed by two trailing synteny
chunks whose `q` sits **above** the inversion's q range.

| k | isInvert | q |
| - | -------- | - |
| 0 | T        | 3 |
| 1 | T        | 2 |
| 2 | T        | 1 |
| 3 | T        | 0 |
| 4 | F        | 5 |
| 5 | F        | 4 |

No positional matches; one non-backbone run. 4T vs 2F is inversion-major.
The last inverted chunk is at k=3. Body walk: `maxQRank` seeds at `q[0]=3`,
`minQRank` falls 3 → 2 → 1 → 0; no cut. Last sub-region's range is
`[0, 3]`. Trailing strip walks back from `runEnd=6`: `q[5]=4` is outside
`[0, 3]` (peel), `q[4]=5` is also outside (peel), and the next step would
cross `bodyEnd=4` so the walk stops. Two regions:

- Region A = `{0, 1, 2, 3}`: all-inverted, the all-inversion shortcut
  skips it. k=0..3 keep `inversion`.
- Region B = `{4, 5}`: all-forward, processed as a normal forward
  region. Offsets `q-b`: k=4 → `+1`, k=5 → `-1`. Counts and events tie
  under unit weights; the base-order tiebreak picks `+1` (k=4 is
  earlier). k=5 gets relabeled to `translocation`.

Contrast: had the trailing forwards' `q` values landed inside `[0, 3]`
(say `q=2` and `q=1`), they would have been **intercepting** the
inverted block in query space - the strip would have left them with the
last sub-region instead of peeling them, and the now-mixed region would
have been labeled under the inverted region rules (flip-forwards if
events permit).

### Example 6: leading syntenies, inverted chunk coincidentally at q[k] === k

Four leading synteny chunks (translocated to higher query positions) before
a clean five-chunk inversion. All nine chunks must end up in the same
region, even though k=4 has `q[4] === 4`.

| k | isInvert | q | -q-b |
| - | -------- | - | ---- |
| 0 | F        | 7 | -7   |
| 1 | F        | 8 | -9   |
| 2 | F        | 6 | -8   |
| 3 | F        | 5 | -8   |
| 4 | T        | 4 | -8   |
| 5 | T        | 3 | -8   |
| 6 | T        | 2 | -8   |
| 7 | T        | 1 | -8   |
| 8 | T        | 0 | -8   |

Backbone check excludes inverted chunks: k=4 has `q=4` but `isInvert=T`, so
it is *not* backbone. No other chunk has `q[k] === k`. The entire group is
one non-backbone run.

The run is inversion-major (5T vs 4F). The last inverted chunk is at k=8,
so there is no trailing forward tail. Refinement walks the body anchoring
on inverted chunks only: k=0..3 are forward and skipped; k=4 seeds
`maxQRank = 4`; k=5..8 have `q` values 3, 2, 1, 0, all `<= 4`, so no cuts.
The walk produces one region covering all nine chunks.

Labeling. The region is inversion-major, so all five inverted chunks
(k=4..8) keep `inversion` automatically. For the forwards: with unit
weights `invEvents = 5 >= fwdEvents = 4`, flip-forwards is on, so every
forward chunk is unconditionally relabeled to `translocation` -
**k=0, k=1, k=2, k=3 all become `translocation`**, including k=2 and
k=3 whose `-q-b = -8` happens to coincide with the inversion's offset
line.

Two failure modes this guards against:

- **Without the `!isInvert` guard on the backbone**, k=4 would have been
  pulled in as backbone, slicing the input into a `[0,4)` forward run, a
  backbone slot at k=4, and a `[5,9)` inverted run. The leading forwards
  would have been processed alone (no inverted majority to compare
  against) and the inversion block would have been processed alone.
- **Without the "forwards always translocation in inverted regions"
  rule**, k=2 and k=3 would have stayed as `synteny` because their `-q-b`
  matches the inversion's `-8` by coincidence, leaving a visually
  disconnected pair of green ribbons between the translocations and the
  inversion.


## Notes

- Backbone detection requires `q[k] === k` **and** `!isInvert`; no
  longest-subsequence pass. Inverted chunks at positional matches are
  coincidences and are not backbone. Any chunk whose query rank drifts
  from its base rank by even one position is handed to the region logic.
- In an inversion-major region, inverted chunks are never relabeled -
  they always keep `inversion`. Only forwards can be relabeled, either
  unconditionally via flip-forwards (`invEvents >= fwdEvents`) or by
  offset minority when flip-forwards is off (`fwdEvents > invEvents`).
  The label `translocation+inversion` is therefore only produced in
  forward-major regions, where an inverted chunk's offset disagrees
  with the majority.
- The inverted-formula switch is per region, not per chunk, and is chosen by
  the region's own majority orientation; the formula is applied uniformly to
  every chunk in the region regardless of that chunk's `isInvert` flag.
- Run refinement only runs on inversion-major runs. Forward-major runs are
  passed through as a single region. After cutting, each sub-region's
  orientation is re-evaluated from its own `isInvert` counts, so a sub-region
  carved out of an inverted run may end up forward and score under `q-b`
  instead. The trailing-forward tail in particular is always forward
  (it's only forward chunks by construction).
- The trailing strip cares about query-space interception, not base
  position alone. A forward chunk whose `q` sits inside the last
  sub-region's q range is **inside** the inversion in query space even
  though it sits after the last inverted chunk in base order, so it
  stays with the inverted region rather than getting peeled.
- The pass operates on chunks, not rows. A chunk that is partly translocated
  stays as one unit with its existing or relabeled `dominant` field; finer
  splitting would have to happen upstream in `chunkRows`.
