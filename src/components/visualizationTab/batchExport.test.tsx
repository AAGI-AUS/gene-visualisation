import { act, createRef } from "react";
import type { RefObject } from "react";
import { render } from "@testing-library/react";
import { strFromU8, unzipSync } from "fflate";
import type { PredictedByLine, VisibleChunkPair } from "@/src/components/visualizationTab/batchExport";
import {
  batchExportAll,
  buildNotableEventsCsv,
  buildCentromeresCsv,
  mergePredicted,
  registerSvgEl,
} from "@/src/components/visualizationTab/batchExport";
import { SyntenyCanvas } from "@/src/components/visualizationTab/SyntenyCanvas";
import { useAppStore } from "@/src/store/useAppStore";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import type { BedRow, Chunk } from "@/types";
import { counts, makeChunk } from "@/src/test/factories";

// jsdom can't decode an SVG image, so HTMLImageElement.decode rejects inside
// svgToPngBlob. Stub to null - the export pipeline already treats null as
// "skip PNG", and we exercise the SVG/CSV/zip path here.
jest.mock("@/src/components/visualizationTab/utils", () => ({
  ...jest.requireActual("@/src/components/visualizationTab/utils"),
  svgToPngBlob: jest.fn().mockResolvedValue(null),
}));

// jsdom (under react-scripts 5) ships a Blob without arrayBuffer() and no
// global TextEncoder; batchExportAll needs both for the fflate pipeline.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  // eslint-disable-next-line no-extend-native
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
if (typeof globalThis.TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (globalThis as unknown as { TextEncoder: unknown }).TextEncoder = require("util").TextEncoder;
}

const NOTABLE_HEADER =
  "base_line|base_chr|query_line|query_chr|event|base_bp1|base_bp2|query_bp1|query_bp2|" +
  "event_count|base_gene_span|query_gene_span|is_inverted|is_translocated|chunk_count";

const dataRows = (csv: string): string[] => csv.split("\n").slice(1);

const parseRow = (row: string) => {
  const [
    baseLine,
    baseChr,
    queryLine,
    queryChr,
    event,
    baseBp1,
    baseBp2,
    queryBp1,
    queryBp2,
    eventCount,
    baseGene,
    queryGene,
    inverted,
    translocated,
    chunkCount,
  ] = row.split("|");

  return {
    baseLine,
    baseChr,
    queryLine,
    queryChr,
    event,
    baseBp1,
    baseBp2,
    queryBp1,
    queryBp2,
    eventCount,
    baseGene,
    queryGene,
    inverted,
    translocated,
    chunkCount,
  };
};

describe("buildNotableEventsCsv", () => {
  const baseChunks: Chunk[] = [
    makeChunk({
      dominant: "inversion",
      chrBase: "1A",
      chrQuery: "1A",
      bp1Base: 0,
      bp2Base: 100,
      bpGeneBase: 10,
      bpGeneQuery: 20,
      eventCounts: counts({ inversion: 5 }),
    }),
    makeChunk({
      dominant: "inversion",
      chrBase: "1A",
      chrQuery: "1A",
      bp1Base: 400,
      bp2Base: 500,
      bpGeneBase: 10,
      bpGeneQuery: 20,
      eventCounts: counts({ inversion: 7 }),
    }),
  ];

  it("emits only the header when there are no pairs", () => {
    expect(buildNotableEventsCsv([], "base")).toBe(NOTABLE_HEADER);
  });

  it("filters out synteny chunks, keeping only notable events", () => {
    const pairs: VisibleChunkPair[] = [
      {
        queryLabel: "q",
        chunks: [
          makeChunk({ dominant: "synteny", eventCounts: counts({ synteny: 9, total: 9 }) }),
          baseChunks[0],
        ],
      },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base"));

    expect(rows).toHaveLength(1);
    const r = parseRow(rows[0]);
    expect(r.event).toBe("inversion");
    expect(r.baseLine).toBe("base");
    expect(r.queryLine).toBe("q");
    expect(r.eventCount).toBe("5");
    expect(r.inverted).toBe("true");
    expect(r.translocated).toBe("false");
    expect(r.chunkCount).toBe("1");
  });

  it("merges consecutive same-event same-chr chunks: spans expand, counts/genes/chunkCount sum", () => {
    const pairs: VisibleChunkPair[] = [{ queryLabel: "q", chunks: baseChunks }];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base"));

    expect(rows).toHaveLength(1);
    const r = parseRow(rows[0]);
    expect(r.event).toBe("inversion");
    expect(r.baseBp1).toBe("0");
    expect(r.baseBp2).toBe("500");
    expect(r.baseGene).toBe("20");
    expect(r.queryGene).toBe("40");
    expect(r.chunkCount).toBe("2");
    expect(r.eventCount).toBe("12");
  });

  it("does not merge same-event chunks on the same chr when a different event sits between them", () => {
    const middle = makeChunk({
      dominant: "translocation",
      chrBase: "1A",
      chrQuery: "1A",
      bp1Base: 200,
      bp2Base: 300,
      eventCounts: counts({ synteny: 4 }),
    });
    const pairs: VisibleChunkPair[] = [{ queryLabel: "q", chunks: [baseChunks[0], middle, baseChunks[1]] }];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base")).map(parseRow);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.event)).toEqual(["inversion", "translocation", "inversion"]);
    expect(rows.map((r) => r.baseBp1)).toEqual(["0", "200", "400"]);
    expect(rows.map((r) => r.baseBp2)).toEqual(["100", "300", "500"]);
    expect(rows.map((r) => r.chunkCount)).toEqual(["1", "1", "1"]);
    expect(rows.map((r) => r.eventCount)).toEqual(["5", "4", "7"]);
  });

  it("reads different count buckets for intra- vs inter-chromosomal translocations", () => {
    const pairs: VisibleChunkPair[] = [
      {
        queryLabel: "q",
        chunks: [
          makeChunk({
            dominant: "translocation",
            chrBase: "1A",
            chrQuery: "1A",
            bp1Base: 0,
            eventCounts: counts({ synteny: 2, translocation: 50 }),
          }),
          makeChunk({
            dominant: "translocation",
            chrBase: "1A",
            chrQuery: "2B",
            bp1Base: 100,
            eventCounts: counts({ synteny: 2, translocation: 50 }),
          }),
        ],
      },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base"));

    expect(rows).toHaveLength(2);
    // intra-chr maps to synteny bucket
    expect(parseRow(rows[0]).eventCount).toBe("2");
    // inter-chr no map
    expect(parseRow(rows[1]).eventCount).toBe("50");
  });

  it("translocation+inversion sets both flags and (intra-chr) reads the inversion bucket", () => {
    const pairs: VisibleChunkPair[] = [
      {
        queryLabel: "q",
        chunks: [
          makeChunk({
            dominant: "translocation+inversion",
            eventCounts: counts({ inversion: 9, "translocation+inversion": 3 }),
          }),
        ],
      },
    ];
    const r = parseRow(dataRows(buildNotableEventsCsv(pairs, "base"))[0]);

    expect(r.event).toBe("translocation+inversion");
    expect(r.inverted).toBe("true");
    expect(r.translocated).toBe("true");
    expect(r.eventCount).toBe("9");
  });

  it("sorts by chrBase then bp1Base, and does not merge across different events", () => {
    const pairs: VisibleChunkPair[] = [
      {
        queryLabel: "q",
        chunks: [
          makeChunk({ dominant: "inversion", chrBase: "2A", chrQuery: "2A", bp1Base: 0 }),
          { ...baseChunks[1], dominant: "translocation" },
          baseChunks[0],
        ],
      },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base")).map(parseRow);

    expect(rows.map((r) => r.baseChr)).toEqual(["1A", "1A", "2A"]);
    expect(rows.map((r) => r.event)).toEqual(["inversion", "translocation", "inversion"]);
  });

  it("chains base_line across pairs: each pair's query line becomes the next base line", () => {
    const pairs: VisibleChunkPair[] = [
      { queryLabel: "q1", chunks: baseChunks },
      { queryLabel: "q2", chunks: baseChunks },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base")).map(parseRow);

    expect([rows[0].baseLine, rows[0].queryLine]).toEqual(["base", "q1"]);
    expect([rows[1].baseLine, rows[1].queryLine]).toEqual(["q1", "q2"]);
  });
});

const PREDICTED_HEADER =
  "Genome Assembly,chr1A,chr1B,chr1D,chr2A,chr2B,chr2D,chr3A,chr3B,chr3D,chr4A,chr4B,chr4D," +
  "chr5A,chr5B,chr5D,chr6A,chr6B,chr6D,chr7A,chr7B,chr7D";

describe("buildCentromeresCsv", () => {
  it("emits only the header for an empty map", () => {
    expect(buildCentromeresCsv(new Map())).toBe(PREDICTED_HEADER);
  });

  it("converts bp to Mbp (1 decimal), blanks missing chrs, and keeps an explicit zero", () => {
    const predicted: PredictedByLine = new Map([
      [
        "lineA",
        new Map([
          ["1A", 300_000],
          ["2B", 0],
          ["7D", 700_000_000],
        ]),
      ],
    ]);
    const lines = buildCentromeresCsv(predicted).split("\n");

    expect(lines[0]).toBe(PREDICTED_HEADER);
    const cells = lines[1].split(",");
    expect(cells[0]).toBe("lineA");
    expect(cells[1]).toBe("0.3"); // chr1A
    expect(cells[2]).toBe(""); // chr1B unset
    expect(cells[5]).toBe("0.0"); // chr2B explicit zero, distinct from blank
    expect(cells[21]).toBe("700.0"); // chr7D
  });

  it("orders rows by line name", () => {
    const predicted: PredictedByLine = new Map([
      ["zeta", new Map([["1A", 100_000_000]])],
      ["alpha", new Map([["1A", 200_000_000]])],
    ]);
    const lines = buildCentromeresCsv(predicted).split("\n");

    expect(lines[1].startsWith("alpha,")).toBe(true);
    expect(lines[2].startsWith("zeta,")).toBe(true);
  });

  it("ignores chromosomes outside the fixed column set", () => {
    const predicted: PredictedByLine = new Map([
      [
        "l",
        new Map([
          ["8A", 50_000_000],
          ["1A", 10_000_000],
        ]),
      ],
    ]);
    const cells = buildCentromeresCsv(predicted).split("\n")[1].split(",");

    expect(cells).toHaveLength(22); // line label + 21 chromosomes
    expect(cells[1]).toBe("10.0"); // chr1A
    expect(cells).not.toContain("50.0"); // chr8A has no column
  });
});

describe("mergePredicted", () => {
  it("adds a new line to the accumulator", () => {
    const acc: PredictedByLine = new Map();

    mergePredicted(acc, new Map([["lineA", new Map([["1A", 100]])]]));
    expect(acc.get("lineA")?.get("1A")).toBe(100);

    mergePredicted(acc, new Map([["lineB", new Map([["1B", 200]])]]));
    expect(acc.get("lineA")?.get("1A")).toBe(100);
    expect(acc.get("lineB")?.get("1B")).toBe(200);
  });

  it("unions chromosomes into an existing line", () => {
    const acc: PredictedByLine = new Map([["lineA", new Map([["1A", 100]])]]);
    mergePredicted(acc, new Map([["lineA", new Map([["2B", 200]])]]));

    expect(acc.get("lineA")?.get("1A")).toBe(100);
    expect(acc.get("lineA")?.get("2B")).toBe(200);
  });

  it("overwrites a chromosome when the incoming line repeats it", () => {
    const acc: PredictedByLine = new Map([["lineA", new Map([["1A", 100]])]]);
    mergePredicted(acc, new Map([["lineA", new Map([["1A", 999]])]]));

    expect(acc.get("lineA")?.get("1A")).toBe(999);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: batchExportAll drives the live stores per chr, serializes the
// mounted SVG, and zips it together with a notable_events CSV derived from
// snapshotFromStores. Covers the seam (selectedChr -> autoSort -> rAF flush ->
// serializeSvg + snapshotFromStores) that the pure-builder tests above bypass.
// ─────────────────────────────────────────────────────────────────────────────

const M = 1e6;

// Two contiguous rows per chr, all sign-flipped in the query so chunkRows
// merges each chr's rows into a single inversion chunk - guaranteed notable.
const baseRows: BedRow[] = [
  { id: 0, chromosome: "1A", p1: 0, p2: 40 * M, sign: "+" },
  { id: 1, chromosome: "1A", p1: 40 * M, p2: 80 * M, sign: "+" },
  { id: 2, chromosome: "2B", p1: 0, p2: 40 * M, sign: "+" },
  { id: 3, chromosome: "2B", p1: 40 * M, p2: 80 * M, sign: "+" },
];

const queryBedText = baseRows.map((r) => [r.chromosome, r.p1, r.p2, "-", r.id].join("\t")).join("\n");

const Harness = ({ svgRef }: { svgRef: RefObject<SVGSVGElement> }) => {
  const result = useAppStore((s) => s.result);
  return <SyntenyCanvas data={result} svgRef={svgRef} width={900} height={300} />;
};

describe("batchExportAll", () => {
  let zipBytes: Uint8Array | null;

  beforeEach(() => {
    zipBytes = null;

    (window as unknown as { showSaveFilePicker: jest.Mock }).showSaveFilePicker = jest.fn().mockResolvedValue({
      createWritable: () =>
        Promise.resolve({
          write: (data: Uint8Array) => {
            zipBytes = data;
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    });

    const queryFile = new File([queryBedText], "queryline.bed", { type: "text/plain" });

    useAppStore.setState({
      base: { name: "baseline.bed", rows: baseRows },
      baseFile: new File([""], "baseline.bed", { type: "text/plain" }),
      queryFiles: [queryFile],
      chromosomes: ["1A", "2B"],
      selectedChr: "1A",
      groupThreshold: 0.01,
      result: [],
      commonIds: new Set(),
      palette: {},
      centromere: new Map(),
      centromereName: null,
      batching: false,
      running: false,
      error: null,
    });

    useVisualizationStore.setState({
      svgW: 900,
      hiddenThreshold: 0,
      gapBp: 1_000,
      sharedAxis: false,
      showMarks: false,
      boundaryTicks: false,
      commonOnly: false,
      denoise: false,
      othersMode: "show",
      stripBlankMbp: 0,
      intra: { ...useVisualizationStore.getState().intra, relabel: false },
    });
  });

  afterEach(() => {
    registerSvgEl(null);
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it("zips per-chr SVGs plus a notable_events CSV derived from each chr's live snapshot", async () => {
    const svgRef = createRef<SVGSVGElement>();
    render(<Harness svgRef={svgRef} />);
    registerSvgEl(svgRef.current);

    await act(() => batchExportAll());

    expect(zipBytes).not.toBeNull();
    const files = unzipSync(zipBytes!);
    expect(Object.keys(files).sort()).toEqual(["1a.svg", "2b.svg", "notable_events.csv"]);
    expect(strFromU8(files["1a.svg"]).startsWith("<svg")).toBe(true);
    expect(strFromU8(files["2b.svg"]).startsWith("<svg")).toBe(true);

    const [header, ...rows] = strFromU8(files["notable_events.csv"]).split("\n");
    expect(header).toBe(NOTABLE_HEADER);

    // One inversion row per chr iteration. If snapshotFromStores were captured
    // once before the loop (the bug class tests.md Finding 2 calls out), only
    // the first chr's rows would land in the CSV.
    const parsed = rows.map(parseRow);
    expect(parsed).toHaveLength(2);

    const ch1A = parsed.find((r) => r.baseChr === "1A");
    expect(ch1A?.event).toBe("inversion");
    expect(ch1A?.queryLine).toBe("queryline");
    expect(ch1A?.baseLine).toBe("baseline");

    const ch2B = parsed.find((r) => r.baseChr === "2B");
    expect(ch2B?.event).toBe("inversion");
  });

  it("restores the pre-loop store state after the export finishes", async () => {
    const svgRef = createRef<SVGSVGElement>();
    render(<Harness svgRef={svgRef} />);
    registerSvgEl(svgRef.current);

    const before = useAppStore.getState();
    const restoreTargets = {
      selectedChr: before.selectedChr,
      result: before.result,
      queryFiles: before.queryFiles,
    };

    await act(() => batchExportAll());

    const after = useAppStore.getState();
    expect(after.selectedChr).toBe(restoreTargets.selectedChr);
    expect(after.result).toBe(restoreTargets.result);
    expect(after.queryFiles).toBe(restoreTargets.queryFiles);
    expect(after.batching).toBe(false);
  });
});
