# gene-visualizer

[![codecov](https://codecov.io/gh/biometryhub/gene-visualisation/graph/badge.svg?token=dVaPov0Yxu)](https://codecov.io/gh/biometryhub/gene-visualisation)

React app for visualizing genomic synteny graph from BED files. It loads a base BED and one or more query BEDs,
joins rows by id, classifies each row as synteny/inversion/translocation, groups contiguous rows into chunks,
and draws ribbons between chromosome bars.

## Quick start

To use the app, download [gene-visualizer-v1.0.0.html][app] or other releases from the [release][release] and
open it in a browser.

### Example

To make your first synteny graph with the sample data downloaded from [`examples/`][examples] (or
[example.zip][example-zip] from [release][release]),

1.  Select `base.bed` as a baseline. 
2.  Select the remaining 4 BED files as query.
3.  Click `RUN` with default parameters. (May need 2 clicks in FireFox)

<img src="docs/steps.png" alt="Steps" width="233">

The result should be similar to the figure below.

![Visualization tab with the example bed files loaded][ss]

## Scripts

- `yarn dev`: start the dev server (craco)
- `yarn build`: production build to `build/`
- `yarn build-one`: a standalone HTML in `dist/` (Python helper required)
- `yarn test`: run the Jest suite (append `--coverage` for a coverage report)

## `yarn build-one` prerequisites

`build-one` runs `./touch-up.py` between the CRA build and the webpack inlining step. The script's shebang is
`#!./env/bin/python`, so a virtualenv must exist at `./env`. One-time setup:

```sh
python3 -m venv env
env/bin/pip install -r requirements.txt
```

After that, `yarn build-one` should work.

## Tech

React 18, TypeScript, CRA via craco, @visx for SVG primitives, zustand for
state, fflate for zipped exports, web workers for BED parsing.

<!-- internal -->

[examples]: ./examples/
[ss]: ./docs/example.png

<!-- external -->

[release]: https://github.com/AAGI-AUS/gene-visualisation/releases/latest
[app]: https://github.com/AAGI-AUS/gene-visualisation/releases/download/v1.0.0/gene-visualizer-v1.0.0.html
[example-zip]: https://github.com/AAGI-AUS/gene-visualisation/releases/download/v1.0.0/examples.zip
