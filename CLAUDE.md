# gene-visualizer

React + TypeScript app for visualizing genomic structural rearrangements and synteny from BED files. Loads a base BED + one or more query BEDs, joins by row id, classifies each row as synteny / inversion / translocation, groups contiguous rows into chunks, and draws ribbons between chromosome bars.

## Stack

- React 18, TypeScript, CRA via craco
- @visx (`group`, `scale`, `shape`, `curve`, `text`, `tooltip`) for SVG primitives
- zustand for state, fuse.js for chromosome search
- prettier + eslint (`react-app`) via husky + lint-staged on `src/**/*.{html,ts,css,tsx}`

## Scripts

- `yarn dev` - craco start (dev server, alias-resolved)
- `yarn build` - standard CRA production build to `build/`
- `yarn build-one` - `craco build && ./touch-up.py && npx webpack` → single self-contained HTML in `dist/` with all CSS/JS inlined (for embedding/distribution)

## Path alias

`@/*` → project root. Always import as `@/src/...` or `@/types`. Don't use relative imports.

## Layout

```
src/
├── App.tsx                   shell: topbar + sidebar + tab switcher (Visualization / Distribution)
├── index.tsx                 ReactDOM entry
├── icons.tsx                 react-icons re-exports
├── constants.ts              layout constants, ChunkEvent colors, CHR_PALETTE, OthersMode, LINE_MAPPING
├── utils.ts                  parseBED, parseCentromere, queryGene, fileToText, getChromosomes
├── help.ts                   helpProps / helpLabelProps for CSS-only hover help bubbles
├── global.css, App.module.css
├── components/
│   ├── sideBar/              Sidebar (root), InputFiles (drag-drop + reorder), Parameters, FileSlot, DropZone
│   ├── visualizationTab/     VisualizationTab (root) → SyntenyCanvas → LinePair → RibbonLayer
│   │   │                     + GenomeRowLayer (exports BaseRowLayer + QueryRowLayer) + CoordinateGrid
│   │   │                     + CentromereMarks; Controls, ChunkTooltip, IntraRelabelControls,
│   │   │                     NumberControl, ToggleButton, ExportButtons, DistributionRow
│   │   ├── utils.ts          chunk building, row layout, ribbon geometry, axis ticks
│   │   ├── relabel.ts        score-based intra-chr translocation relabeler (see relabel.md)
│   │   └── batchExport.ts    SVG/PNG/CSV export
│   └── DistributionTab.tsx   event/chromosome distribution charts
├── hooks/
│   └── useVisualizationLayout.ts   memoized chunks → baseRow/queryRow → ribbons
└── store/
    ├── useAppStore.ts        domain: base/query/centromere files, analysis result, palette, error, running
    ├── useVisualizationStore.ts   render: svgW, hover, tooltip, layout flags, intra-relabel config
    └── utils.ts              buildPalette, computeCommonIds
```

`types.ts` (project root) holds shared domain types: `BedRow`, `BedFile`, `CentromereData`, `ResultRow`, `Chunk`, `ChrBar`/`OthersBar`, `BaseRow`/`QueryRow`, etc.

`src/components/visualizationTab/relabel.md` documents the score-based intra-chromosomal relabeler.

## Data flow

1. **Load** - user picks base + query BED files in the sidebar; `setBase`/`setQueryFiles` parse via `parseBED` (tab-separated, no header). Row `id` is positional and is the join key.
2. **Analyze** (`runAnalysis` or `autoSort` in `useAppStore`) - filter base to `selectedChr`; left-join each query by `id`; derive `isInvert`, `isTranslocation`, `mainEvent`. `queryGene` then collapses query chromosomes that appear less than `groupThreshold` into `"others"` and sets `groupedQuery`.
3. **Layout** (`useVisualizationLayout`) - group ResultRows into `Chunk[]` (split on `gapBp` and event boundary), optionally rescore intra-chr translocations via `relabelIntraChunks` (gated by `intra.relabel`; see `relabel.md`), build `BaseRow`/`QueryRow` with pixel coords scaled by bp-length, then compute ribbon paths (swap endpoints for inversions).
4. **Render** - `SyntenyCanvas` stacks one `LinePair` per query; each pair = `RibbonLayer` (bezier paths) + `BaseRowLayer` + `QueryRowLayer` (both exported from `GenomeRowLayer.tsx`) + optional `CoordinateGrid` / `CentromereMarks`. Width comes from a `ResizeObserver` writing `svgW` to the visualization store.

## State

Two zustand stores, separated by concern:

- **`useAppStore`** - domain/data: `base`, `baseFile`, `queryFiles`, `chromosomes`, `selectedChr`, `groupThreshold`, `result`, `commonIds`, `centromere`/`centromereName`, `palette`, `running`, `batching`, `error`. Actions: `setBase`, `setQueryFiles`, `swapBaseWithQuery`, `setCentromere`/`clearCentromere`, `runAnalysis`, `autoSort`, `clearBase`/`clearQuery`/`reorderQuery`, `setAppState`.
- **`useVisualizationStore`** - render-only: `svgW`, `fontSize`, `hoverChunk`, `tooltip`, `gapBp` (stored in kbp; default `100` = 100k), `hiddenThreshold`, `othersMode` (`hide`|`show`|`group`), `commonOnly`, `denoise`, `sharedAxis`, `boundaryTicks`, `showMarks`, `stripBlankMbp`, `intra` (relabel config: `relabel`, `minLocalEvents`, `gapStopMbp`, `driftK`, `complexMin`; see `relabel.md`).

Keep parsing/analysis in `useAppStore` and hover/sizing/tooltip in `useVisualizationStore` - don't mix.

## Conventions

- BED row ids are positional; left-join by id is the core operation - preserve ordering when refactoring `parseBED` or `queryGene`.
- Most SVG geometry is hand-rolled (`bpToPx`, `ribbonPath`); @visx is used thinly. Don't reach for d3 - match the existing pattern.
- Chromosome colors come from cycling `CHR_PALETTE` deterministically via `buildPalette` so renders stay stable across analyses.
- Default to no comments; identifiers are descriptive. CSS lives in colocated `*.module.css` files.
- Tests live next to source as `*.test.ts` (`src/utils.test.ts`, `src/store/utils.test.ts`, `src/components/visualizationTab/{utils,batchExport}.test.ts`). CI runs `yarn test --coverage --watchAll=false` and uploads to Codecov. Add tests next to the module you touch; don't introduce a separate `__tests__/` tree.

## Hover help

Control tooltips are CSS-only: `helpProps(text, align?)` from `src/help.ts` puts `data-help` / `data-help-align` on an element, and `global.css` draws the bubble with `[data-help]::after` plus a `::before` arrow. No JS, no state, nothing to inline for `build-one`.

- Text lives in the `HELP` map in `constants.ts`, keyed by store field. An empty string renders no bubble, so unwritten entries are inert.
- Spread `helpProps` onto the label text only, never the whole control - hovering a unit suffix or an input shouldn't trigger it.
- `NumberControl` and `ToggleButton` take optional `help` / `helpAlign`; anywhere else (sidebar `thresholdRow`s), wrap the label text in a `<span>` and spread it there.
- `align` is `"start"` (default) / `"center"` / `"end"` - use `"end"` for anything in `rightCluster` so the bubble doesn't run off-screen.
- The bubble opens downward and its width is capped by `--help-max-w` (260px default, 185px on sidebar `.thresholdRow` since the sidebar clips horizontally).
- Bubbles are DOM, not SVG, so they never reach SVG/PNG export.

## Shared-axis tick lines

When `sharedAxis` is on, `CoordinateGrid` draws ribbon-style polylines rather than straight verticals. One segment per pair, each computed with the same `bpToPx` logic ribbons use:

- `xTop = bpToPx(baseBar_chr, bp)` against the pair's base bar.
- `xBottom = bpToPx(queryBar_chr, bp)` against the pair's query bar.
- Segment slants inside a pair when base/query bar positions differ; pair P's `xBottom` and pair P+1's `xTop` share the same track data, so segments meet at pair boundaries.
- Ticks step in absolute bp (`Math.ceil(p1 / stepBp) * stepBp …`), not offsets - label `"100M"` always means absolute bp 100M.
- `barTicks` generates ticks from each bar's own `p1`/`bpLen`; `collectTicks` (utils.ts) then joins base and query ticks by `chr`+`bp`. A bp on both sides is a connector candidate. A bp on one side only (a chr the other row lacks, or a bp past the other bar's end) still gets a label on that side.
- Ticks are built once per pair in `SyntenyCanvas` (`ticksPerPair`, memoized on layouts + step) and handed to `LinePair` as `ticks` / `nextTicks` - pair P's own ticks are pair P-1's `nextTicks`, and `LinePair` re-renders on every hover, so building them inside `CoordinateGrid` cost two full passes per pair per mouse move. `CoordinateGrid` is pure rendering; it never touches `ChrBar`.
- A connector is drawn only between rows on the same axis. `sameScale` on the layout is `groupOf[p] === groupOf[p + 1]`, so a pair whose two rows sit in different chr-set groups draws no connectors at all. The figure has one px/bp throughout, but the two rows' bp-to-x mappings still differ: a different chr set moves the running cursor, and `stripBlankMbp` can move a group's `chrMin`. A slanted line across that break is unreadable. `|xTop - xBottom|` within `MAX_TICK_OFFSET_FRAC` of the narrower bar stays as a backstop for same-group offsets (the `othersMode === "group"` stub can shift one row's cursor).
- Suppressed ticks and single-sided ticks get a `TICK_MARK_PX` mark through the bar instead, so a label is never left floating. Marks render only where labels do.
- Every scale run is labelled at its last row, below the bar, whatever `boundaryTicks` says. A neighbouring run's bars sit at a different offset, so its labels cannot be carried across. With `boundaryTicks` on (toolbar `Intra ticks`, default on) a multi-row run is also headed above its first bar, and the rows in between are labelled too. A pair renders top labels when `isFirst || (boundaryTicks && startsScale && !endsScale)` and bottom labels when `nextEndsScale || (boundaryTicks && sameScale)`, where `startsScale`/`endsScale` are the run edges of its base row and `nextEndsScale` of its query row. The `!endsScale` term is what keeps a one-row run to the bottom placement alone, so no row ever carries both label sets.

The step is one figure-wide value, resolved in `SyntenyCanvas` by `resolveTickStepBp(bars, fontSize - 1, tickIntervalMbp)` and fed to the `ticksPerPair` memo. `tickIntervalMbp` (visualization store, toolbar `Ticks`) forces an interval; `0` means auto: snap the larger of two candidate steps up to the next 1 / 2 / 2.5 / 5 / 10 multiple - `max(TICK_TARGET_PX, TICK_TARGET_EM * fontSize) / pxPerBp` (spacing, where `pxPerBp` is the smallest `pw / bpLen` in the figure) and `widestBpLen / MAX_TICKS_PER_CHR` (count). Spacing binds on narrow or many-chr rows; the count cap binds on wide exports where spacing alone would draw dozens of ticks. It must stay figure-wide - `bottomLabelTicks` dedups pair P against pair P+1 by `${chr}-${bp}` key, which only matches if both pairs used the same step. Labels come from `formatBpLabel`, which picks k/M/G per value and trims trailing zeros. Ticks are never decimated, so a small manual interval on a narrow bar will overlap; `MAX_TICKS_PER_BAR` only guards against a runaway loop.

`buildBaseRow` / `buildQueryRow` (utils.ts) place each pair's bars with a running cursor, so the same chr's `bar.px` can differ between rows when preceding chrs differ in width. That is what makes ticks slant instead of running straight down.

### How far the shared scale reaches

`sharedPxPerBp` (useVisualizationLayout) is one ratio for the whole figure: the smallest `(trackW - gaps) / totalBp` across all tracks, so the track carrying the most bp fills `trackW` and nothing is ever compressed to fit.

`paddedAxes` then pads every lighter track out towards that same right edge: it converts the leftover px back to bp at the shared ratio and adds it to the last chr's `chrMax`. Scale is untouched; the axis runs past where the _joined rows_ stop and the bar covers the whole extent. Three consequences:

- The padding all lands on the last chr in `chrOrder`. If a multi-chr track is the lighter one, that chromosome ends up wider than the same chromosome on the track that set the ratio. Spreading the deficit across every chr makes it worse: then no chr on the row matches its counterpart.
- The tail is drawn as sequence, so it has to be sequence. A bar's `chrMax` covers only the part of the chromosome that joined the selected base chr; the chromosome itself usually runs further, and the tail is that remainder, carrying no genes mapped to this base chr. Ticks in it sit at correct bp and bar lengths stay comparable.
- `extensionCap` holds a tail to two tests: the chr reaches that far, and the rows above and below end on the same chr so the tail is not hanging over a different one. Length comes from `chrExtent`, the highest `p2` per chr over a whole BED before the id filter - `PackedCache.chrEnd` for a query (via `packedChrExtent`, carried on each `Result` entry), `BedFile.chrExtent` for the base (via `chrExtentOf`). Both are optional; pass neither and the pair's own rows stand in, which recovers what chunk filtering dropped but nothing past the join, so the row stops at its data. The bound is figure-wide - the furthest **any** row carries that chr - because the rows are different genomes of one chromosome at one scale and a group already unions its members' bounds. Measured per row or per group it lands behind the bars a row lines up with, and the row ends short of its neighbours. The neighbour test instead runs per chr-set group, one failure zeroing the tail for all of its tracks, so one group stays one axis and its members pad alike. A row failing either test leaves the canvas ragged. `max p2` under-reads the chromosome end anyway (last gene, not telomere) - a `chrom.sizes`/`.fai` loaded the way `parseCentromere` loads its CSV would sharpen it without changing the rule.

Groups decide bounds, not scale. `partitionTracksByChrSet` + `computeGroupBounds` + `applyGlobalExtension` give each group its own per-chr `chrMin`/`chrMax` (`chrMin` snaps out to the global min unless the leading blank exceeds `stripBlankMbp`). So the same chr can still be a different width in two groups - because it covers a different bp span there, not because it is at a different scale.

One ratio does not make ticks run straight down. `bar.px` comes from a running cursor over `chrOrder`, so a row missing a leading chr shifts every later chr left by that bar's width, and a stripped leading blank shifts a bar's bp-to-x mapping by a constant. Both are why connectors stay gated on `sameScale` plus the `MAX_TICK_OFFSET_FRAC` backstop, and why `collectTicks` still emits single-sided ticks.

## Build pipeline notes

`build-one` runs three steps: CRA build → `touch-up.py` (post-processes the build output) → `webpack.config.js` runs `HtmlBundlerPlugin` to inline everything into one `dist/index.html`. If a change breaks the single-file build but works in `yarn dev`, suspect the inlining step (asset URLs, dynamic imports, web workers).

## Pre-commit

Husky runs `lint-staged`: prettier on html/ts/css/tsx, eslint --fix on ts/tsx. Don't bypass with `--no-verify` - fix the lint instead.

## Commit guidelines

Use Conventional Commits (e.g., feat:, fix:, docs:, test:, chore:). Keep messages imperative and scoped.
