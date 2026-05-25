# gene-visualizer

<!--
Private repo: this Codecov badge needs the read-only graphing token appended,
e.g. .../badge.svg?token=XXXX. Copy the full URL from Codecov ->
repo Settings -> Badges & Graphs and replace the URL below.
-->
[![codecov](https://codecov.io/gh/biometryhub/gene-visualisation/graph/badge.svg)](https://codecov.io/gh/biometryhub/gene-visualisation)

React + TypeScript app for visualizing genomic structural rearrangements and
synteny from BED files. It loads a base BED plus one or more query BEDs, joins
rows by id, classifies each row as synteny / inversion / translocation, groups
contiguous rows into chunks, and draws ribbons between chromosome bars.

## Scripts

- `yarn dev`: start the dev server (craco)
- `yarn build`: production build to `build/`
- `yarn build-one`: single self-contained HTML in `dist/` with CSS/JS inlined
- `yarn test`: run the Jest suite (append `--coverage` for a coverage report)

## Tech

React 18, TypeScript, CRA via craco, @visx for SVG primitives, zustand for
state, fuse.js for chromosome search.
