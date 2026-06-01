import { packParsed, filterPacked, parseFiltered } from "@/src/store/analysisJob";
import type { BedRow } from "@/types";

const row = (id: number, chromosome: string, sign: "+" | "-" = "+", p1 = id * 10, p2 = p1 + 5): BedRow => ({
  id,
  chromosome,
  p1,
  p2,
  sign,
});

describe("packParsed", () => {
  it("returns typed arrays sized to the input row count", () => {
    const cache = packParsed([row(0, "1A"), row(1, "1A"), row(2, "2B")]);
    expect(cache.ids.length).toBe(3);
    expect(cache.p1.length).toBe(3);
    expect(cache.p2.length).toBe(3);
    expect(cache.sign.length).toBe(3);
    expect(cache.chrIdx.length).toBe(3);
    expect(cache.ids).toBeInstanceOf(Float64Array);
    expect(cache.sign).toBeInstanceOf(Uint8Array);
    expect(cache.chrIdx).toBeInstanceOf(Uint8Array);
  });

  it("interns chromosome names into a dictionary with stable indices", () => {
    const cache = packParsed([row(0, "1A"), row(1, "2B"), row(2, "1A"), row(3, "3D")]);
    expect(cache.chrDict).toEqual(["1A", "2B", "3D"]);
    expect(Array.from(cache.chrIdx)).toEqual([0, 1, 0, 2]);
  });

  it("encodes sign as 0 for + and 1 for -", () => {
    const cache = packParsed([row(0, "1A", "+"), row(1, "1A", "-"), row(2, "1A", "+")]);
    expect(Array.from(cache.sign)).toEqual([0, 1, 0]);
  });

  it("preserves id, p1, p2 verbatim in their typed slots", () => {
    const cache = packParsed([row(7, "1A", "+", 100, 200), row(42, "2B", "-", 300, 400)]);
    expect(Array.from(cache.ids)).toEqual([7, 42]);
    expect(Array.from(cache.p1)).toEqual([100, 300]);
    expect(Array.from(cache.p2)).toEqual([200, 400]);
  });

  it("returns an empty cache for empty input", () => {
    const cache = packParsed([]);
    expect(cache.ids.length).toBe(0);
    expect(cache.chrDict).toEqual([]);
  });
});

describe("filterPacked", () => {
  it("returns only rows whose id is in the filter set", () => {
    const cache = packParsed([row(0, "1A"), row(1, "2B"), row(2, "1A"), row(3, "3D")]);
    const out = filterPacked(cache, new Set([1, 3]));
    expect(out).toEqual([row(1, "2B"), row(3, "3D")]);
  });

  it("preserves the source ordering of matched rows", () => {
    const cache = packParsed([row(5, "1A"), row(2, "2B"), row(9, "1A"), row(1, "3D")]);
    const out = filterPacked(cache, new Set([1, 5, 9]));
    expect(out.map((r) => r.id)).toEqual([5, 9, 1]);
  });

  it("returns an empty array when no ids match", () => {
    const cache = packParsed([row(0, "1A"), row(1, "1A")]);
    expect(filterPacked(cache, new Set([999]))).toEqual([]);
  });

  it("returns an empty array for an empty filter set", () => {
    const cache = packParsed([row(0, "1A"), row(1, "1A")]);
    expect(filterPacked(cache, new Set())).toEqual([]);
  });

  it("round-trips through pack + filter without data loss", () => {
    const rows = [row(10, "1A", "-", 100, 250), row(11, "2B", "+", 300, 450), row(12, "3D", "-", 500, 650)];
    const allIds = new Set(rows.map((r) => r.id));
    expect(filterPacked(packParsed(rows), allIds)).toEqual(rows);
  });
});

describe("parseFiltered", () => {
  const bed = (rows: (string | number)[][]) => rows.map((r) => r.join("\t")).join("\n");

  it("parses queryText and filters rows by the supplied ids", () => {
    const text = bed([
      ["1A", 0, 100, "+", 0],
      ["1A", 100, 200, "+", 1],
      ["2B", 200, 300, "-", 2],
    ]);
    const res = parseFiltered({ jobId: 7, ids: new Set([0, 2]), queryText: text });
    expect(res.jobId).toBe(7);
    expect(res.rows.map((r) => r.id)).toEqual([0, 2]);
  });

  it("returns an empty rows array when queryText is undefined", () => {
    const res = parseFiltered({ jobId: 3, ids: new Set([0]) });
    expect(res).toEqual({ jobId: 3, rows: [] });
  });
});
