# Post-chunk relabel: intra-chromosomal translocations

Re-labels chunks whose query-side order disagrees with base-side order on the
same chromosome. Runs after `chunkRows` and only mutates `chunk.dominant`; the
row-level `isTranslocation` (different chromosomes) is untouched. Operates per
pair on each `chrBase === chrQuery` group.

## Definitions

- **Base rank** `b`: position when sorted by `bp1Base` (ties: original index).
- **Query rank** `q`: position when sorted by `bp1Query` (same tiebreak).
- **Backbone**: forward chunks with `q[k] === k`. Inverted chunks at the
  same coincidence are **not** backbone - treating them as such would slice
  an inversion block. Backbone is never relabeled.
- **Run**: maximal contiguous block of non-backbone chunks in base order.
- **Region**: a run, possibly split by refinement.
- **Orientation**: a region is *inverted* iff strict majority of chunks are
  `isInvert`; else *forward* (ties go forward).
- **Offset** (one formula per region, applied uniformly to every chunk):
  - forward region: `q - b`
  - inverted region: `-q - b`

  A clean forward block has uniform `q-b`; a clean inverted block has
  uniform `-q-b`.

## Algorithm

1. Group by `(chrBase, chrQuery)`, keep matches, skip groups of <2.
2. Compute base order and `q`.
3. Mark backbones (`q[k] === k && !isInvert`); their labels stand.
4. Walk base order; maximal non-backbone stretches are **runs**.
5. **Refinement** runs on any run with ≥1 inverted chunk (pure-forward runs
   pass through as one region). Same logic regardless of forward- vs
   inversion-major - this is what isolates translocated forwards stranded
   past an inversion inside an otherwise forward-major run.
   1. **Body walk** through the last inverted chunk, anchoring on
      inverteds only (forwards ride along). First inverted seeds
      `maxQRank`; later inverteds cut whenever `q[k] > maxQRank` (strict),
      reseeding `maxQRank`. Each piece is a region.
   2. **Trailing strip**: from `runEnd`, walk back while
      `q[k-1] > maxQRank` of the last sub-region. The peeled suffix is a
      separate trailing-forward region; intercepting forwards
      (`q ≤ maxQRank`) stay with the last sub-region.
6. **Label** each region independently:
   1. **All-inverted region**: skip; every chunk keeps `inversion`.
   2. Pick orientation.
   3. **Inversion-major**: inverteds always keep `inversion`. For
      forwards:
      - `invEvents ≥ fwdEvents` (**flip-forwards** on): all forwards →
        `translocation` without consulting offsets.
      - `fwdEvents > invEvents`: forwards join the offset majority
        (inverteds still don't contribute).
   4. **Forward**: every chunk votes on `q-b` majority.
   5. **Majority offset** wins by total `eventCounts.total`, then by
      chunk count, then by earliest base order.
   6. Non-majority chunks relabel by their own `isInvert`:
      - forward → `translocation`
      - inverted, forward region → `translocation+inversion`
      - inverted, inversion-major region → stays `inversion` (see 3).

A region with uniform offset (incl. single-chunk) relabels nothing.

`translocation+inversion` is only produced in **forward** regions - in
inversion-major regions, inverteds never relabel.

## Worked examples

### Ex 1: clean inversion next to syntenies

```
k:         0 1 2 3 4 5 6 7
q:         0 1 2 6 5 4 3 7
isInvert:  F F F T T T T F
```

Backbone = {0,1,2,7}. Region {3-6}: all-inverted, skipped. D-G keep
`inversion`.

### Ex 2: synteny with minority offset

11 forward chunks; `q-b`: `+1 +1 +1 -8 -8 -8 +1 +1 +1 +1 -8`. Majority `+1`
(7 vs 4). The four `-8` chunks → `translocation`.

### Ex 3: synteny chunk inside an inversion-major region

```
k:        3 4 5 6 7
isInvert: T F T T T
q:        5 6 4 2 1
```

Body walk: k=3 seeds `maxQRank=5`; k=4 (forward) skipped; k=5..7 all
`q ≤ 5`, no cut. One region. Inverteds keep `inversion`; with
`invEvents=4 ≥ fwdEvents=1`, flip-forwards on, k=4 → `translocation`. Note
k=5's `-q-b=-9` differs from the others' `-8` but it still stays
`inversion`.

### Ex 4: two consecutive inversions

8 chunks, all inverted; `q`: `3 2 1 0 7 6 5 4`. No backbone. Body walk:
seeds `maxQRank=3`; k=4 has `q=7 > 3` → cut and reseed. Two regions, both
all-inverted, both skipped. Refinement preserves them as two distinct
units for downstream overlays.

### Ex 5: trailing forwards past an inversion

```
k:        0 1 2 3 4 5
isInvert: T T T T F F
q:        3 2 1 0 5 4
```

Body walk: `maxQRank=3`. Trailing strip: `q[5]=4 > 3` (peel), `q[4]=5 > 3`
(peel). Two regions:
- `{0..3}`: all-inverted, skipped.
- `{4,5}`: forward, offsets `+1, -1`. Tie on events/count; base-order
  picks `+1`, so k=5 → `translocation`.

Had the trailing forwards had `q=2, q=1` (≤ `maxQRank`) instead, they'd be
intercepting and stay with the inverted region (where flip-forwards would
relabel them to `translocation`).

### Ex 6: leading translocated forwards, coincident `q[k] === k`

```
k:        0 1 2 3 4 5 6 7 8
isInvert: F F F F T T T T T
q:        7 8 6 5 4 3 2 1 0
```

k=4 has `q=4` but is inverted → not backbone. One run, inversion-major.
Body walk seeds `maxQRank=4` at k=4; k=5..8 all `q ≤ 4`, no cut. Inverteds
stay `inversion`; flip-forwards on (5 ≥ 4) → k=0..3 all become
`translocation`, including k=2/3 whose `-q-b=-8` coincides with the
inverteds' line. Without the `!isInvert` backbone guard, k=4 would slice
the run and lose the inverted-vs-forward comparison.

### Ex 7: forward-major run with a stranded translocated forward

A run holds a tight inversion pair plus many forwards after, including
one whose `q` sits past the inversion's `maxQRank`. Refinement still
fires (≥1 inverted): body walk seeds `maxQRank` from the inverteds; the
trailing strip peels the maximal suffix of forwards with
`q > maxQRank` into its own region. That isolates the displaced
forward(s) so they don't compete with the synteny block for majority
offset and stay `synteny`. Without this (the pre-fix short-circuit on
forward-major runs), the whole thing was one region and the displaced
forward got relabeled `translocation`.

## Tie-breaking summary

- Equal `bp1` → lower original index gets earlier rank.
- Majority offset: events → chunk count → earliest base order.
- Orientation tie → forward.
- Flip-forwards gate uses `≥` (tie flips).
- Refinement cut uses strict `>` (ties stay).
- Trailing strip peels only non-intercepting forwards
  (`q > maxQRank`); intercepting ones stay.

## Notes

- The pass operates on chunks, not rows. A partly-translocated chunk
  stays as one unit; finer splitting belongs upstream in `chunkRows`.
- The offset formula is per region, not per chunk; same formula is
  applied to every chunk in the region regardless of its `isInvert`.
- After cutting, each sub-region's orientation is re-evaluated from its
  own counts - a sub-region carved from an inversion-major run may end
  up forward and score under `q-b`. The trailing-forward tail is always
  forward by construction.
- The trailing strip cares about query-space interception, not base
  position alone: a forward after the last inverted in base order whose
  `q` is inside the inversion's q range is intercepting and stays.
