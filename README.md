# gene-visualizer

[![codecov](https://codecov.io/gh/biometryhub/gene-visualisation/graph/badge.svg?token=dVaPov0Yxu)](https://codecov.io/gh/biometryhub/gene-visualisation)

React + TypeScript app for visualizing genomic structural rearrangements and
synteny from BED files. It loads a base BED plus one or more query BEDs, joins
rows by id, classifies each row as synteny / inversion / translocation, groups
contiguous rows into chunks, and draws ribbons between chromosome bars.

## Scripts

- `yarn dev`: start the dev server (craco)
- `yarn build`: production build to `build/`
- `yarn build-one`: single self-contained HTML in `dist/` with CSS/JS inlined (requires the Python helper, see below)
- `yarn test`: run the Jest suite (append `--coverage` for a coverage report)

## Example data

`examples/` holds a synthetic set: `base.bed` plus four query files, one per
event type (synteny, inversion, intra-chromosomal translocation,
inter-chromosomal translocation). Load `base.bed` as the base and all four
queries, keep chromosome `1A`, and leave the parameters at their defaults.
`examples/README.md` describes how each file was built and what it should draw.

Every release also ships `examples.zip` alongside the single-file HTML, so a
download of the app comes with data to open in it.

## `yarn build-one` prerequisites

`build-one` runs `./touch-up.py` between the CRA build and the webpack inlining
step. The script's shebang is `#!./env/bin/python`, so a virtualenv must exist
at `./env` with `beautifulsoup4` installed. One-time setup:

```sh
python3 -m venv env
env/bin/pip install -r requirements.txt
```

After that, `yarn build-one` works as-is. `yarn dev` and `yarn build` don't
need the venv.

## Tech

React 18, TypeScript, CRA via craco, @visx for SVG primitives, zustand for
state, fuse.js for chromosome search.
