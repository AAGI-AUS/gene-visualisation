# gene-visualizer

React + TypeScript app for visualizing genomic structural rearrangements and synteny from BED files. Loads a base BED + one or more query BEDs, joins by row id, classifies each row as synteny / inversion / translocation, groups contiguous rows into chunks, and draws ribbons between chromosome bars.

## Stack

- React 18, TypeScript, CRA via craco
- @visx (`group`, `scale`, `shape`, `curve`, `text`, `tooltip`) for SVG primitives
- zustand for state, fuse.js for chromosome search
- prettier + eslint (`react-app`) via husky + lint-staged on `src/**/*.{html,ts,css,tsx}`

## Scripts

- `yarn dev` — craco start (dev server, alias-resolved)
- `yarn build` — standard CRA production build to `build/`
- `yarn build-one` — `craco build && ./touch-up.py && npx webpack` → single self-contained HTML in `dist/` with all CSS/JS inlined (for embedding/distribution)

## Path alias

`@/*` → project root. Always import as `@/src/...` or `@/types`. Don't use relative imports.

## Layout

```
src/
├── App.tsx                   Sidebar + tabbed content (Visualization / Distribution)
├── constants.ts              Layout constants, ChunkEvent colors, CHR_PALETTE, OthersMode
├── utils.ts                  parseBED, queryGene, fileToText, getChromosomes
├── components/
│   ├── sideBar/              InputFiles (drag-drop + reorder), Parameters, FileSlot, DropZone
│   ├── visualizationTab/     SyntenyCanvas → LinePair → {Ribbon,BaseRow,Query}Layer + ChunkTooltip + Controls
│   │   └── utils.ts          chunk building, row layout, ribbon geometry
│   └── DistributionTab.tsx   event/chromosome distribution charts
├── hooks/
│   └── useVisualizationLayout.ts   memoized chunks → baseRow/queryRow → ribbons
└── store/
    ├── useAppStore.ts        domain: files, analysis result, palette, error, running
    ├── useVisualizationStore.ts   render: svgW, hover, tooltip, gapBp, othersMode, baseRows
    └── utils.ts              buildPalette
```

`types.ts` (project root) holds shared domain types: `BedRow`, `BedFile`, `ResultRow`, `Chunk`, `ChrBar`/`OthersBar`, `BaseRow`/`QueryRow`, etc.

## Data flow

1. **Load** — user picks base + query BED files in the sidebar; `setBase`/`setQueryFiles` parse via `parseBED` (tab-separated, no header). Row `id` is positional and is the join key.
2. **Analyze** (`runAnalysis` or `autoSort` in `useAppStore`) — filter base to `selectedChr`; left-join each query by `id`; derive `isInvert`, `isTranslocation`, `mainEvent`. `queryGene` then collapses query chromosomes that appear less than `groupThreshold` into `"others"` and sets `groupedQuery`.
3. **Layout** (`useVisualizationLayout`) — group ResultRows into `Chunk[]` (split on `gapBp` and event boundary), build `BaseRow`/`QueryRow` with pixel coords scaled by bp-length, then compute ribbon paths (swap endpoints for inversions).
4. **Render** — `SyntenyCanvas` stacks one `LinePair` per query; each pair = `RibbonLayer` (bezier paths) + `BaseRowLayer` + `QueryRowLayer`. Width comes from a `ResizeObserver` writing `svgW` to the visualization store.

## State

Two zustand stores, separated by concern:

- **`useAppStore`** — domain/data: `base`, `queryFiles`, `chromosomes`, `selectedChr`, `groupThreshold`, `result`, `palette`, `running`, `error`. Actions: `setBase`, `setQueryFiles`, `runAnalysis`, `autoSort`, `clearBase`/`clearQuery`/`reorderQuery`.
- **`useVisualizationStore`** — render-only: `svgW`, `hoverChunk`, `tooltip`, `gapBp` (default 100k), `hiddenThreshold`, `othersMode` (`hide`|`show`|`group`), `baseRows[]` (accumulated y-offsets for stacked pairs).

Keep parsing/analysis in `useAppStore` and hover/sizing/tooltip in `useVisualizationStore` — don't mix.

## Conventions

- BED row ids are positional; left-join by id is the core operation — preserve ordering when refactoring `parseBED` or `queryGene`.
- Most SVG geometry is hand-rolled (`bpToPx`, `ribbonPath`); @visx is used thinly. Don't reach for d3 — match the existing pattern.
- Chromosome colors come from cycling `CHR_PALETTE` deterministically via `buildPalette` so renders stay stable across analyses.
- Default to no comments; identifiers are descriptive. CSS lives in colocated `*.module.css` files.
- No tests exist. Jest/RTL ship from CRA but nothing is wired up — don't claim test coverage you didn't add.

## Shared-axis tick lines

When `sharedAxis` is on, `CoordinateGrid` draws ribbon-style polylines, not straight verticals — one segment per pair, each segment computed with the same `bpToPx` logic ribbons use:

- `xTop = bpToPx(baseBar_chr, bp)` against the pair's **base** bar.
- `xBottom = bpToPx(queryBar_chr, bp)` against the pair's **query** bar.
- Segment slants inside a pair when base/query bar positions differ; pair P's `xBottom` and pair P+1's `xTop` share the same track data, so segments meet at pair boundaries.
- Ticks step in **absolute bp** (`Math.ceil(max(p1) / TICK_INTERVAL_BP) * TICK_INTERVAL_BP …`), not offsets — label `"100M"` always means absolute bp 100M.
- A chr renders ticks only when it's in both `baseBars` and `queryBars` of the pair; tick range is bounded by `min(base+baseExtent, query+queryExtent)` so neither endpoint clamps.

Per-pair bars are placed with a running cursor in `buildBaseRow` / `buildQueryRow` (utils.ts), so the same chr's `bar.px` can differ between rows if preceding chrs differ in width. That's why ticks sometimes need to slant rather than being strictly vertical.

## Build pipeline notes

`build-one` is the unusual path: CRA build → `touch-up.py` (post-processes the build output) → `webpack.config.js` runs `HtmlBundlerPlugin` to inline everything into one `dist/index.html`. If a change breaks the single-file build but works in `yarn dev`, suspect the inlining step (asset URLs, dynamic imports, web workers).

## Pre-commit

Husky runs `lint-staged`: prettier on html/ts/css/tsx, eslint --fix on ts/tsx. Don't bypass with `--no-verify` — fix the lint instead.

## Commit Guidelines

Use Conventional Commits (e.g., feat:, fix:, docs:, test:, chore:). Keep messages imperative and scoped.
