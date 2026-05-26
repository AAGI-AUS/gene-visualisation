import {
  buildNotableEventsCsv,
  buildPredictedCentromeresCsv,
  type PredictedByLine,
  type VisibleChunkPair,
} from "@/src/components/visualizationTab/batchExport";
import type { Chunk, EventCounts } from "@/types";

const counts = (overrides: Partial<EventCounts> = {}): EventCounts => ({
  synteny: 0,
  inversion: 0,
  translocation: 0,
  "translocation+inversion": 0,
  total: 0,
  ...overrides,
});

const makeChunk = (overrides: Partial<Chunk> = {}): Chunk => ({
  id: "c",
  ids: [0],
  chrBase: "1A",
  bp1Base: 0,
  bp2Base: 100,
  bpGeneBase: 10,
  chrQuery: "1A",
  bp1Query: 0,
  bp2Query: 100,
  bpGeneQuery: 20,
  dominant: "synteny",
  eventCounts: counts(),
  queryChromCounts: {},
  isInvert: false,
  isOthers: false,
  ...overrides,
});

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
  it("emits only the header when there are no pairs", () => {
    expect(buildNotableEventsCsv([], "base")).toBe(NOTABLE_HEADER);
  });

  it("filters out synteny chunks, keeping only notable events", () => {
    const pairs: VisibleChunkPair[] = [
      {
        queryLabel: "q",
        chunks: [
          makeChunk({ dominant: "synteny", eventCounts: counts({ synteny: 9, total: 9 }) }),
          makeChunk({ dominant: "inversion", eventCounts: counts({ inversion: 5, total: 5 }) }),
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
    const pairs: VisibleChunkPair[] = [
      {
        queryLabel: "q",
        chunks: [
          makeChunk({
            dominant: "translocation",
            bp1Base: 0,
            bp2Base: 100,
            bp1Query: 0,
            bp2Query: 100,
            bpGeneBase: 10,
            bpGeneQuery: 20,
            eventCounts: counts({ synteny: 3, translocation: 99 }),
          }),
          makeChunk({
            dominant: "translocation",
            bp1Base: 200,
            bp2Base: 300,
            bp1Query: 150,
            bp2Query: 250,
            bpGeneBase: 5,
            bpGeneQuery: 7,
            eventCounts: counts({ synteny: 4, translocation: 88 }),
          }),
        ],
      },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base"));
    expect(rows).toHaveLength(1);
    const r = parseRow(rows[0]);
    expect(r.baseBp1).toBe("0");
    expect(r.baseBp2).toBe("300");
    expect(r.queryBp1).toBe("0");
    expect(r.queryBp2).toBe("250");
    expect(r.baseGene).toBe("15");
    expect(r.queryGene).toBe("27");
    expect(r.chunkCount).toBe("2");
    // intra-chr translocation maps to the synteny bucket: 3 + 4, not 99 + 88
    expect(r.eventCount).toBe("7");
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
    // intra-chr -> SYNTENY_MAP remaps to synteny bucket
    expect(parseRow(rows[0]).eventCount).toBe("2");
    // inter-chr -> reads the translocation bucket directly
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
          makeChunk({ dominant: "translocation", chrBase: "1A", chrQuery: "1A", bp1Base: 50 }),
          makeChunk({ dominant: "inversion", chrBase: "1A", chrQuery: "1A", bp1Base: 10 }),
        ],
      },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base")).map(parseRow);
    expect(rows.map((r) => r.baseChr)).toEqual(["1A", "1A", "2A"]);
    expect(rows.map((r) => r.event)).toEqual(["inversion", "translocation", "inversion"]);
  });

  it("chains base_line across pairs: each pair's query line becomes the next base line", () => {
    const pairs: VisibleChunkPair[] = [
      { queryLabel: "q1", chunks: [makeChunk({ dominant: "inversion" })] },
      { queryLabel: "q2", chunks: [makeChunk({ dominant: "inversion" })] },
    ];
    const rows = dataRows(buildNotableEventsCsv(pairs, "base")).map(parseRow);
    expect([rows[0].baseLine, rows[0].queryLine]).toEqual(["base", "q1"]);
    expect([rows[1].baseLine, rows[1].queryLine]).toEqual(["q1", "q2"]);
  });
});

const PREDICTED_HEADER =
  "Genome Assembly,chr1A,chr1B,chr1D,chr2A,chr2B,chr2D,chr3A,chr3B,chr3D,chr4A,chr4B,chr4D," +
  "chr5A,chr5B,chr5D,chr6A,chr6B,chr6D,chr7A,chr7B,chr7D";

describe("buildPredictedCentromeresCsv", () => {
  it("emits only the header for an empty map", () => {
    expect(buildPredictedCentromeresCsv(new Map())).toBe(PREDICTED_HEADER);
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
    const lines = buildPredictedCentromeresCsv(predicted).split("\n");
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
    const lines = buildPredictedCentromeresCsv(predicted).split("\n");
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
    const cells = buildPredictedCentromeresCsv(predicted).split("\n")[1].split(",");
    expect(cells).toHaveLength(22); // line label + 21 chromosomes
    expect(cells[1]).toBe("10.0"); // chr1A
    expect(cells).not.toContain("50.0"); // chr8A has no column
  });
});
