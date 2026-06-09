import { packParsed, filterPacked, transferables } from "@/src/store/analysisJob";
import type { BedRow } from "@/types";

type Row = (id: number, chromosome: string, sign?: "+" | "-", p1?: number, p2?: number) => BedRow;
const row: Row = (id, chromosome, sign = "+", p1 = id * 10, p2 = p1 + 5) => ({ id, chromosome, p1, p2, sign });
const rows = [row(0, "1A", "+"), row(11, "2B", "-"), row(2, "1A", "-"), row(3, "3D", "+")];
const cache = packParsed(rows);

describe("packParsed", () => {
  it("returns typed arrays sized to the input row count", () => {
    expect(cache.ids.length).toBe(4);
    expect(cache.p1.length).toBe(4);
    expect(cache.p2.length).toBe(4);
    expect(cache.sign.length).toBe(4);
    expect(cache.chrIdx.length).toBe(4);
    expect(cache.ids).toBeInstanceOf(Float64Array);
    expect(cache.sign).toBeInstanceOf(Uint8Array);
    expect(cache.chrIdx).toBeInstanceOf(Uint16Array);
  });

  it("converts chromosome names into a dictionary with stable indices", () => {
    expect(cache.chrDict).toEqual(["1A", "2B", "3D"]);
    expect(Array.from(cache.chrIdx)).toEqual([0, 1, 0, 2]);
  });

  it("encodes sign as 0 for + and 1 for -", () => {
    expect(Array.from(cache.sign)).toEqual([0, 1, 1, 0]);
  });

  it("preserves id, p1, p2", () => {
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
    const filtered = filterPacked(cache, new Set([5, 11, 3]));
    expect(filtered).toEqual([rows[1], rows[3]]);
  });

  it("preserves the source ordering of matched rows", () => {
    const filteredIds = filterPacked(cache, new Set([0, 3, 11])).map((r) => r.id);
    expect(filteredIds).toEqual([0, 11, 3]);
  });

  it("returns an empty array when no ids match", () => {
    const filtered = filterPacked(packParsed(rows), new Set([999]));
    expect(filtered).toEqual([]);
  });

  it("returns an empty array for an empty filter set", () => {
    const filtered = filterPacked(packParsed(rows), new Set());
    expect(filtered).toEqual([]);
  });

  it("round-trips through pack + filter without data loss", () => {
    const filtered = filterPacked(packParsed(rows), new Set([0, 11, 2, 3]));
    expect(filtered).toEqual(rows);
  });
});

describe("transferables", () => {
  it("lists the buffers of every typed array in the packed cache", () => {
    const packed = packParsed(rows);
    const buffers = transferables(packed);
    expect(buffers).toEqual([
      packed.ids.buffer,
      packed.p1.buffer,
      packed.p2.buffer,
      packed.sign.buffer,
      packed.chrIdx.buffer,
    ]);
  });
});
