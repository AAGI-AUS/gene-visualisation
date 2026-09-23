# Example BED files

Synthetic data for demoing the viewer. Load `base.bed` as the base and the four `q*.bed` files as
queries, keep base chromosome `1A`, and use the default parameters (group threshold 1%, gap 100 kbp,
hidden blocks 10, common only + denoise on, intra relabel on).

Base line: ~7400 genes on `1A` (0-60 Mbp) and ~1480 on `1B`, one gene every ~8 kbp, gene length
1.5-4.5 kbp. Every query is that same gene set rearranged, joined back by row id.

What holds across all four queries:

- **Synteny dominates.** Events are carved out of a long colinear backbone at fixed rates - inversion
  ~10% of the chromosome, intra-chromosomal translocation ~3.6%, inter-chromosomal ~19% and confined
  to the end of the chromosome. Everything else stays in place.
- **Base and query spans rarely match** - block spans come out 8% short to 7% long, and only ~10% of
  blocks land within 0.5% of 1:1. Ribbons are trapezoids, not parallel bands.
- **The stretch is one warp of the base axis, shared by all four files.** It has to be shared: with
  `Auto sort` the joins are chained (`prev = winner.rows` in `useAppStore`), so pair k compares line
  k against line k-1, not against the base. Per-file random scaling would make those query-vs-query
  ratios differ by up to 20% - past the 10% tolerance in `chunkRows` - and every chained pair would
  shatter into single-gene chunks. One shared warp keeps colinear stretches at a 1:1 ratio between
  any two queries while still differing from the base.
- **Every event has an unaligned breakpoint**, 120-160 kbp of genes missing on each side. Without it
  `chunkRows` absorbs the leading part of a small event into the neighbouring synteny chunk (its
  query span still tracks the backbone for a while), which leaves a stump too small to label
  correctly. A handful of wider holes per file plus ~2% random dropout, all differing per file, is
  what `Common only` / `Denoise` act on.
- **No hole overlaps any event, in any file.** `Common only` unions the four files' missing genes, so
  a hole placed over another file's event would shrink or split that event's block there. Holes are
  planned across all four files at once for that reason; a breakpoint that would run into a
  neighbouring event is dropped instead.

Blocks drawn with all four queries loaded at the defaults above, where every event listed here draws
as one labelled block:

| file                         | blocks | events                                                              |
| ---------------------------- | ------ | ------------------------------------------------------------------- |
| `base.bed`                   | -      | reference line                                                      |
| `q1_synteny.bed`             | 25     | none - colinear throughout                                          |
| `q2_inversion.bed`           | 29     | 6 inversion (10.2% of `1A`)                                         |
| `q3_intra_translocation.bed` | 28     | 2 translocation, 1 translocation+inversion, 4 inversion             |
| `q4_inter_translocation.bed` | 30     | 3 translocation, 3 translocation+inversion, all → `2A` at 48-60 Mbp |

Every event block is at least 0.6 Mbp, ~1% of the chromosome, for two reasons: anything thinner draws
as a hairline a few pixels wide, and `relabel.ts` hard-labels any chunk under `STRAY_MAX_EVENTS` (50
genes) that sits between two backbones as a translocation instead of scoring it. Dropping
`hidden blocks` to 1 or 0 therefore changes nothing but the appearance of a few extra synteny
slivers - no label flips - and the same holds for the chained `Auto sort` pairs (25-41 blocks each,
none of them single-gene).

## q1 - colinear baseline

Same chromosome, same order, same signs, so every block is synteny. What varies is the blocking: the
backbone breaks wherever any query is missing genes, and each block has a base span a few percent off
its query span.

## q2 - inversions

Six blocks of 0.5-1.5 Mbp are sign-flipped and reversed in place, 10.2% of the chromosome; everything
else is synteny. The event comes straight from the join (`isInvert`, same chromosome), no
relabelling involved.

## q3 - intra-chromosomal translocation

Three blocks of 0.6-0.9 Mbp (3.6% of the chromosome) are cut out and pasted elsewhere in the query
order, 4-10 positions away; one of them is also inverted. Another 5.6% is inverted in place, spread
over four blocks. Every row keeps its chromosome and (mostly) its sign, so the raw join sees almost
nothing; the displacement exists only at block level, where the relabeler finds it. Turn
`Intra relabel` off and the three translocation blocks fall back to synteny.

The blocks left in place are the backbone the relabeler scores everything else against. This is the
file to use when tuning `minLocalEvents` / `gapStopMbp` / `driftK` (see
`src/components/visualizationTab/relabel.md`).

## q4 - inter-chromosomal translocation

The distal end of the chromosome, 48-60 Mbp, is chopped into six consecutive blocks that all move
to `2A`, alternating forward and inverted - 3 translocation and 3 translocation+inversion. Nothing
else on `1A` moves: the translocation is a single terminal event, not a scatter. The slivers between
the blocks are 5-10 genes each, under the hidden-block threshold, so the tip reads as one fan onto
the `2A` bar. The alternating direction is what keeps the six blocks separate - two adjacent
same-direction blocks would merge across a sliver that thin. Different query chromosome means the
join labels these directly, no relabelling needed.

The region is deliberately large - 19% of the chromosome. `Common only` is on by default, and it
drops any query chromosome holding less than `COMMON_CHR_THRESHOLD` (10%) of the common ids, so a
scattered minor translocation to some other chromosome would be filtered out of every render. That
same threshold rules out an "others" demo here: a chromosome can't be both above 10% for
`Common only` and under the 1% group threshold, so "others" only ever appears with `Common only` off.
