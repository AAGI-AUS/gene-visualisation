# Post-chunk relabel: intra-chromosomal translocations

Re-labels chunks whose query offset disagrees with the surrounding backbone on the same chromosome. Runs after `chunkRows` and only mutates `chunk.dominant`; the row-level `isTranslocation` (different chromosomes) is untouched. Operates per pair on each `chrBase === chrQuery` group.

Public entry: `relabelIntraChunks(chunks, enabled, scoreConfig)`. Returns the input ref when `!enabled` so downstream memoization short-circuits.

## Definitions

- **Base order**: chunks sorted by `bp1Base` (ties: original `idx`).
- **`q[k]`**: query-order rank of chunk `k` (rank when sorted by `bp1Query`, same tiebreak).
- **Backbone**: `q[k] === k`. Backbones are never relabeled and supply the local reference offset.
- **Region**: smallest closed permutation window of non-backbone chunks. A run from `runStart` extends until `set(q[runStart..runEnd)) === {runStart..runEnd-1}` so backbones never split a region.
- **`avgBp1` / `avgBp2`**: edges averaged across base and query coords - `(bp1Base + bp1Query)/2`, `(bp2Base + bp2Query)/2`. Used everywhere a chunk needs a single bp anchor.
- **Pivot-X**: x-shape crossing point of an inverted chunk, `(dQ*bp1Base + dB*bp2Query)/(dB+dQ)`. Two inverteds within `PIVOT_CLUSTER_THRESHOLD` (1 Mbp) share a candidate.
- **Local backbones**: backbones collected outward from a region's center, weighted by `eventCounts.total`, until cumulative weight reaches `minLocalEvents`. Each side stops at the first gap >= `gapStopMbp`.
- **`med`**: weighted median of `queryCenter - baseCenter` across local backbones. Falls back to the chromosome-wide weighted median when the local sample is empty.

## Algorithm

1. **Group** chunks by `chrBase` where `chrBase === chrQuery`; skip groups of <2.
2. **Stray pre-filter** (one pass per group): drop any small chunk (`eventCounts.total < STRAY_MAX_EVENTS = 50`) sandwiched between two near-backbones (`|q[k]-k| <= 1 && !isInvert`) and hard-label it `translocation` (or `translocation+inversion` if inverted). Recompute `q` after dropping.
3. **Build regions** by cutting at the smallest closed permutation window (`buildRegions`).
4. **Score pass per region** (`runScorePass`):
   1. `regionCenter` = median of the region's `baseCenter`s.
   2. `localBackbones` = `collectLocalBackbones(geom, regionCenter, minLocalEvents, gapStopBp)`. `med` = weighted median (or `globalMed`).
   3. **Build candidates** (`buildRegionCandidates`): each forward chunk is one candidate scored at its own center; inverteds are pivot-X clustered and each cluster is one candidate scored at the cluster's envelope center.
   4. `score(centerB, centerQ) = |(centerQ - centerB) / med - 1|`. Sort candidates ascending.
   5. **Merge score clusters** (`mergeScoreClusters`): adjacent scores within `SCORE_DIFF_TOL = 0.03` collapse into one event-weighted group score (`groupScore = sum(score * weight) / sum(weight)`), so a tight outlier cluster can't widen min-max and inflate the gate.
   6. **Complex chr flag**: if the region has `>= complexMin` distinct merged group scores, flag `chrBase` for the next iteration.
   7. **Mark**: min-max normalize scores to `[0, 1]`; every candidate with normalized score `>= driftK` is relabeled - its forward items to `translocation`, its inverted cluster items to `translocation+inversion`. Backbones, by definition, are not in any region.
5. **Iterate** (`relabelByScore`): rebuild regions with already-relabeled chunks excluded so previously hidden structure can re-emerge as backbone. The first pass covers all chrs; each subsequent pass restricts to chrs flagged complex by the previous pass. Stops when no chr is flagged complex or no new labels were added.

**Two-candidate special case**: a region with exactly two candidates skips normalization and relabels `candidates[1]` iff `candidates[0].score !== candidates[1].score`.

## Config

`IntraScoreConfig` (from `useVisualizationStore.intra`):

| field            | meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `minLocalEvents` | outward walk stops once cumulative event weight reaches this               |
| `gapStopMbp`     | outward walk stops on a side at the first gap `>=` this many Mbp           |
| `driftK`         | normalized-score threshold (after min-max) for marking a candidate         |
| `complexMin`     | distinct merged group scores in a region that flag the chr as complex     |

Internal constants (not exposed):

| constant                    | value       | role                                              |
| --------------------------- | ----------- | ------------------------------------------------- |
| `PIVOT_CLUSTER_THRESHOLD`   | `1e6`       | bp distance for pivot-X inverted clustering       |
| `SCORE_DIFF_TOL`            | `0.03`      | adjacent-score merge tolerance                    |
| `STRAY_MAX_EVENTS`          | `50`        | event-count cap for the sandwiched-stray filter   |

## Notes

- Operates on chunks, not rows. A partly-translocated chunk stays as one unit; finer splitting belongs upstream in `chunkRows`.
- Inverteds in one pivot cluster share an event and share a candidate score - they relabel together or stay together.
- The score is signed-symmetric via `|· - 1|`: a chunk whose offset matches the local backbone scores ~0; one shifted in either direction scores higher.
- `med` is computed in mixed-space (`queryCenter - baseCenter`) and so is each candidate's offset; the score divides one by the other, so units cancel.
- Iteration matters: a translocation that was the dominant signal in pass 1 can vanish in pass 2 (excluded from regions), letting the next layer of structure score against the true backbone.
