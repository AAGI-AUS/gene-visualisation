import {
  autoSortCacheKey,
  clearAutoSortCache,
  getAutoSortSnapshot,
  setAutoSortSnapshot,
} from "@/src/store/autoSortCache";
import type { AutoSortSnapshot } from "@/src/store/autoSortCache";

const snap = (order: string[]): AutoSortSnapshot => ({
  order,
  result: [],
  commonIds: new Set(),
  palette: {},
});

beforeEach(() => clearAutoSortCache());

describe("autoSortCacheKey", () => {
  it("is independent of query file order", () => {
    const a = autoSortCacheKey("base", "1A", 0.01, ["q1", "q2"]);
    const b = autoSortCacheKey("base", "1A", 0.01, ["q2", "q1"]);
    expect(a).toBe(b);
  });

  it("differs when base, chromosome, threshold, or query set differ", () => {
    const base = autoSortCacheKey("base", "1A", 0.01, ["q1"]);
    expect(autoSortCacheKey("other", "1A", 0.01, ["q1"])).not.toBe(base);
    expect(autoSortCacheKey("base", "2A", 0.01, ["q1"])).not.toBe(base);
    expect(autoSortCacheKey("base", "1A", 0.02, ["q1"])).not.toBe(base);
    expect(autoSortCacheKey("base", "1A", 0.01, ["q1", "q2"])).not.toBe(base);
  });
});

describe("snapshot store", () => {
  it("round-trips a snapshot by key", () => {
    setAutoSortSnapshot("k", snap(["q2", "q1"]));
    expect(getAutoSortSnapshot("k")?.order).toEqual(["q2", "q1"]);
  });

  it("returns undefined after clear", () => {
    setAutoSortSnapshot("k", snap(["q1"]));
    clearAutoSortCache();
    expect(getAutoSortSnapshot("k")).toBeUndefined();
  });

  it("evicts the least-recently-used entry past the cap", () => {
    for (let i = 0; i < 64; i++) setAutoSortSnapshot(`k${i}`, snap([`q${i}`]));
    getAutoSortSnapshot("k0"); // touch so k1 becomes the oldest
    setAutoSortSnapshot("k64", snap(["q64"]));

    expect(getAutoSortSnapshot("k1")).toBeUndefined();
    expect(getAutoSortSnapshot("k0")?.order).toEqual(["q0"]);
    expect(getAutoSortSnapshot("k64")?.order).toEqual(["q64"]);
  });
});
