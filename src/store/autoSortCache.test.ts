import { sortCacheKey, clearSortCache, getSortSnapshot, setSortSnapshot } from "@/src/store/autoSortCache";
import type { SortSnapshot } from "@/src/store/autoSortCache";

const snap = (order: string[]): SortSnapshot => ({
  order,
  result: [],
  commonIds: new Set(),
  palette: {},
});

beforeEach(() => clearSortCache());

describe("autoSortCacheKey", () => {
  it("is independent of query file order", () => {
    const a = sortCacheKey("base", "1A", 0.01, ["q1", "q2"]);
    const b = sortCacheKey("base", "1A", 0.01, ["q2", "q1"]);
    expect(a).toBe(b);
  });

  it("differs when base, chromosome, threshold, or query set differ", () => {
    const base = sortCacheKey("base", "1A", 0.01, ["q1"]);
    expect(sortCacheKey("other", "1A", 0.01, ["q1"])).not.toBe(base);
    expect(sortCacheKey("base", "2A", 0.01, ["q1"])).not.toBe(base);
    expect(sortCacheKey("base", "1A", 0.02, ["q1"])).not.toBe(base);
    expect(sortCacheKey("base", "1A", 0.01, ["q1", "q2"])).not.toBe(base);
  });
});

describe("snapshot store", () => {
  it("round-trips a snapshot by key", () => {
    setSortSnapshot("k", snap(["q2", "q1"]));
    expect(getSortSnapshot("k")?.order).toEqual(["q2", "q1"]);
  });

  it("returns undefined after clear", () => {
    setSortSnapshot("k", snap(["q1"]));
    clearSortCache();
    expect(getSortSnapshot("k")).toBeUndefined();
  });

  it("evicts the least-recently-used entry past the cap", () => {
    for (let i = 0; i < 64; i++) setSortSnapshot(`k${i}`, snap([`q${i}`]));
    getSortSnapshot("k0"); // touch so k1 becomes the oldest
    setSortSnapshot("k64", snap(["q64"]));

    expect(getSortSnapshot("k1")).toBeUndefined();
    expect(getSortSnapshot("k0")?.order).toEqual(["q0"]);
    expect(getSortSnapshot("k64")?.order).toEqual(["q64"]);
  });
});
