import {
  fileToText,
  getChromosomes,
  max,
  min,
  parseBED,
  parseCentromere,
  queryGene,
  withinThreshold,
} from "@/src/utils";
import type { BedRow } from "@/types";

describe("min / max", () => {
  it("min returns the numerically smallest argument", () => {
    expect(min(3, 1, 2)).toBe(1);
    expect(min(-5, -2, -8)).toBe(-8);
    expect(min(42)).toBe(42);
  });

  it("max returns the numerically largest argument", () => {
    expect(max(3, 1, 2)).toBe(3);
    expect(max(-5, -2, -8)).toBe(-2);
    expect(max(42)).toBe(42);
  });

  it("min / max compare strings lexicographically", () => {
    expect(min("banana", "apple", "cherry")).toBe("apple");
    expect(max("banana", "apple", "cherry")).toBe("cherry");
    expect(min("10", "2", "1")).toBe("1");
    expect(max("10", "2", "1")).toBe("2");
  });
});

describe("withinThreshold", () => {
  it("identical values are within threshold", () => {
    expect(withinThreshold(100, 100)).toBe(true);
  });

  it("uses the 10% default threshold", () => {
    expect(withinThreshold(105, 100)).toBe(true);
    expect(withinThreshold(120, 100)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(withinThreshold(150, 100, 0.5)).toBe(false);
    expect(withinThreshold(149, 100, 0.5)).toBe(true);
  });
});

describe("parseBED", () => {
  const baseRows = ["1A\t100\t200\t+\t0", "1B\t300\t400\t-\t1"];
  const baseExpectedRows: BedRow[] = [
    { id: 0, chromosome: "1A", p1: 100, p2: 200, sign: "+" },
    { id: 1, chromosome: "1B", p1: 300, p2: 400, sign: "-" },
  ];

  it("parses tab-separated rows with positional ids", () => {
    const text = baseRows.join("\n");
    const rows = parseBED(text);
    expect(rows).toEqual(baseExpectedRows);
  });

  it("skips comment lines and blank lines", () => {
    const text = ["# header", "", baseRows[0], "# another", baseRows[1]].join("\n");
    const rows = parseBED(text);
    expect(rows.map((r) => r.chromosome)).toEqual(["1A", "1B"]);
  });

  it("drops rows whose chromosome name is not exactly two characters", () => {
    const text = ["chr1A\t10\t20\t+\t2", ...baseRows].join("\n");
    expect(parseBED(text)).toEqual(baseExpectedRows);
  });

  it("drops rows where p1 >= p2", () => {
    const text = ["1A\t200\t100\t+\t2", "1A\t100\t100\t+\t3", ...baseRows].join("\n");
    expect(parseBED(text)).toEqual(baseExpectedRows);
  });

  it("falls back to the row index when the id column is missing or zero", () => {
    const text = ["1A\t10\t20\t+", "1A\t50\t60\t+\t9"].join("\n");
    const rows = parseBED(text);
    expect(rows.map((r) => r.id)).toEqual([0, 9]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseBED("")).toEqual([]);
    expect(parseBED("   \n  ")).toEqual([]);
  });
});

describe("queryGene", () => {
  const rowsToMap = (rows: BedRow[]) => new Map(rows.map((r) => [r.id, r]));
  const baseRows: BedRow[] = [
    { id: 0, chromosome: "1A", p1: 0, p2: 100, sign: "+" },
    { id: 1, chromosome: "1A", p1: 100, p2: 200, sign: "+" },
    { id: 2, chromosome: "1A", p1: 200, p2: 300, sign: "+" },
    { id: 3, chromosome: "1A", p1: 300, p2: 400, sign: "+" },
  ];

  const queryRows: BedRow[] = [
    { id: 0, chromosome: "1A", p1: 0, p2: 100, sign: "+" },
    { id: 1, chromosome: "1A", p1: 100, p2: 200, sign: "-" },
    { id: 2, chromosome: "2B", p1: 0, p2: 100, sign: "+" },
    { id: 3, chromosome: "2B", p1: 100, p2: 200, sign: "-" },
  ];

  it("classifies synteny, inversion, and translocation per row", () => {
    const queryMap = rowsToMap(queryRows);
    const { rows } = queryGene(baseRows, queryMap, 0);

    expect(rows).toHaveLength(4);
    expect(rows[0].mainEvent).toBe("synteny");
    expect(rows[0].isInvert).toBe(false);
    expect(rows[0].isTranslocation).toBe(false);

    expect(rows[1].mainEvent).toBe("inversion");
    expect(rows[1].isInvert).toBe(true);
    expect(rows[1].isTranslocation).toBe(false);

    expect(rows[2].mainEvent).toBe("translocation");
    expect(rows[2].isInvert).toBe(false);
    expect(rows[2].isTranslocation).toBe(true);

    // translocation wins over inversion in mainEvent classification
    expect(rows[3].mainEvent).toBe("translocation");
    expect(rows[3].isInvert).toBe(true);
    expect(rows[3].isTranslocation).toBe(true);
  });

  it("skips base rows with no matching query id", () => {
    const queryMap = rowsToMap([queryRows[0], queryRows[2]]);
    const { rows } = queryGene(baseRows, queryMap, 0);
    expect(rows.map((r) => r.id)).toEqual([0, 2]);
  });

  it("ignores query ids that have no matching base row", () => {
    const nonMatchingRow: BedRow = { id: 99, chromosome: "1A", p1: 900, p2: 1000, sign: "+" };
    const queryMap = rowsToMap([queryRows[1], queryRows[2], nonMatchingRow]);
    const { rows } = queryGene(baseRows, queryMap, 0);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("groups rare chromosomes into 'others' once their share is at/below threshold", () => {
    const queryMap = rowsToMap(queryRows.slice(0, 3));
    // 2B share = 1/3 = 0.33; threshold 0.4
    const { rows, chromosomes } = queryGene(baseRows, queryMap, 0.4);
    const grouped = rows.map((r) => [r.chromosomeQuery, r.groupedQuery]);
    expect(grouped).toEqual([
      ["1A", "1A"],
      ["1A", "1A"],
      ["2B", "others"],
    ]);
    expect(chromosomes).toEqual(["1A"]);
  });

  it("returns empty results when there are no matches", () => {
    const { rows, chromosomes } = queryGene(baseRows, new Map(), 0.01);
    expect(rows).toEqual([]);
    expect(chromosomes).toEqual([]);
  });
});

describe("parseCentromere", () => {
  const baseRows = ["ArinaLrFor,210,250", "CDC Landmark,200,"];

  it("parses a CSV into the line/chr -> bp map", () => {
    const text = ["Genome Assembly,chr1A,chr1B", ...baseRows].join("\n");
    const out = parseCentromere(text);
    expect(out.get("arina")?.get("1A")).toEqual([210_000_000]);
    expect(out.get("arina")?.get("1B")).toEqual([250_000_000]);
    expect(out.get("landmark")?.get("1A")).toEqual([200_000_000]);
    expect(out.get("landmark")?.get("1B")).toBeUndefined();
  });

  it("accumulates positions across multiple rows for the same line", () => {
    const text = [
      "Genome Assembly,chr1A",
      "Chinese Spring (dataset 1)a,210",
      "Chinese Spring (dataset 2)a,212",
    ].join("\n");
    const out = parseCentromere(text);
    expect(out.get("cs")?.get("1A")).toEqual([210_000_000, 212_000_000]);
  });

  it("ignores rows whose assembly is not in LINE_MAPPING", () => {
    const text = ["Genome Assembly,chr1A,chr1B", "MysteryLine,300,", baseRows[0]].join("\n");
    const out = parseCentromere(text);
    expect(out.size).toBe(1);
    expect(out.get("arina")?.get("1A")).toEqual([210_000_000]);
    expect(out.get("arina")?.get("1B")).toEqual([250_000_000]);
  });

  it("skips empty and non-numeric cells silently", () => {
    const text = ["Genome Assembly,chr1A,chr1B", "ArinaLrFor,,not-a-number", baseRows[1]].join("\n");
    const out = parseCentromere(text);
    expect(out.get("arina")?.size).toBe(0);
    expect(out.get("landmark")?.get("1A")).toEqual([200_000_000]);
  });

  it("returns an empty map when input has no data rows", () => {
    expect(parseCentromere("").size).toBe(0);
    expect(parseCentromere("Genome Assembly,chr1A").size).toBe(0);
  });
});

describe("getChromosomes", () => {
  it("returns each chromosome once in first-seen order", () => {
    const rows: BedRow[] = [
      { id: 0, chromosome: "1A", p1: 0, p2: 1, sign: "+" },
      { id: 1, chromosome: "1A", p1: 1, p2: 2, sign: "+" },
      { id: 2, chromosome: "2B", p1: 0, p2: 1, sign: "+" },
      { id: 3, chromosome: "1A", p1: 2, p2: 3, sign: "+" },
    ];
    expect(getChromosomes(rows)).toEqual(["1A", "2B"]);
  });

  it("returns an empty array for empty input", () => {
    expect(getChromosomes([])).toEqual([]);
  });
});

describe("fileToText", () => {
  it("reads a File's contents as UTF-8 text", async () => {
    const file = new File(["hello\nworld"], "f.bed", { type: "text/plain" });
    await expect(fileToText(file)).resolves.toBe("hello\nworld");
  });
});
